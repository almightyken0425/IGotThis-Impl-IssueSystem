import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { authed, bootstrap, registerSession, testUrl, type Session } from './testHarness.js';

/**
 * 直插一個獨立 Company + 帳號 + session，回帶簽章 cookie 的呼叫器。
 * 單一 Company 模式下註冊只會綁既有租戶，要驗跨租戶隔離須另建 Company。
 */
async function makeSeparateTenant(
  app: FastifyInstance,
  pool: Pool,
): Promise<ReturnType<typeof authed>> {
  const companyId = randomUUID();
  const accountId = randomUUID();
  const sessionId = `sess_${randomUUID()}`;
  const now = Date.now();
  await pool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [companyId, 'Company B']);
  await pool.query(
    `INSERT INTO accounts (id, company_id, name, email, password_hash, created_on, updated_on)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [accountId, companyId, 'B Owner', `b_${accountId}@example.com`, 'x', now],
  );
  await pool.query(
    `INSERT INTO sessions (id, company_id, account_id, created_on, expires_on)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, companyId, accountId, now, now + 3600_000],
  );
  const signed = app.signCookie(sessionId);
  return authed(app, `igotthis_sid=${signed}`);
}

// workspace 路由整合測試：以 Fastify inject 打真路由連 igotthis_test。
// 涵蓋冪等啟動、加值工單建立與列出、欄位更新，與租戶隔離。

const suite = testUrl ? describe : describe.skip;

suite('workspace routes', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let session: Session;
  let call: ReturnType<typeof authed>;

  beforeAll(async () => {
    ({ pool, app } = await bootstrap());
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE companies CASCADE');
    session = await registerSession(app);
    call = authed(app, session.cookie);
  });

  it('未帶 cookie 存取工作區回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/workspace' });
    expect(res.statusCode).toBe(401);
  });

  it('啟動工作區回脈絡：工單集 KEY 為 IGT、含四個狀態與結案原因選項', async () => {
    const res = await call({ method: 'GET', url: '/api/workspace' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.issueSet.key).toBe('IGT');
    expect(body.issueType.name).toBe('task');
    expect(body.statuses.map((s: { name: string }) => s.name)).toEqual([
      '待處理',
      '處理中',
      '審查中',
      '已完成',
    ]);
    expect(body.statuses.at(-1).isTerminal).toBe(true);
    expect(body.resolutionOptions.map((r: { value: string }) => r.value)).toEqual([
      '已完成',
      '不做',
    ]);
  });

  it('冪等：重複啟動不重建、工單集 id 穩定', async () => {
    const first = (await call({ method: 'GET', url: '/api/workspace' })).json();
    const second = (await call({ method: 'GET', url: '/api/workspace' })).json();
    expect(second.issueSet.id).toBe(first.issueSet.id);
    expect(second.issueType.id).toBe(first.issueType.id);
  });

  it('建立工單回加值列，編號遞增、預設狀態為待處理', async () => {
    const first = await call({
      method: 'POST',
      url: '/api/workspace/issues',
      payload: { title: '修復登入頁', point: 3 },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().issue.key).toBe('IGT-1');
    expect(first.json().issue.title).toBe('修復登入頁');
    expect(first.json().issue.status).toBe('待處理');
    expect(first.json().issue.point).toBe(3);

    const second = await call({
      method: 'POST',
      url: '/api/workspace/issues',
      payload: { title: '第二張', status: '處理中', assignee: '陳彥廷', due: '2026-08-20' },
    });
    expect(second.json().issue.key).toBe('IGT-2');
    expect(second.json().issue.status).toBe('處理中');
    expect(second.json().issue.assignee).toBe('陳彥廷');
    expect(second.json().issue.due).toBe('2026-08-20');
  });

  it('建立後在列表看得到', async () => {
    await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } });
    await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'B' } });
    const res = await call({ method: 'GET', url: '/api/workspace/issues' });
    expect(res.statusCode).toBe(200);
    const titles = res.json().issues.map((i: { title: string }) => i.title);
    expect(titles).toContain('A');
    expect(titles).toContain('B');
    expect(res.json().issues).toHaveLength(2);
  });

  it('沿合法路徑逐步轉換：待處理→處理中→審查中→已完成，終止時寫入結案原因', async () => {
    const created = (
      await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } })
    ).json().issue;

    const toDoing = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '處理中' },
    });
    expect(toDoing.statusCode).toBe(200);
    expect(toDoing.json().issue.status).toBe('處理中');

    const toReview = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '審查中' },
    });
    expect(toReview.statusCode).toBe(200);
    expect(toReview.json().issue.status).toBe('審查中');

    const toDone = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '已完成', resolution: '已完成' },
    });
    expect(toDone.statusCode).toBe(200);
    expect(toDone.json().issue.status).toBe('已完成');
    expect(toDone.json().issue.resolution).toBe('已完成');
  });

  it('跳過中間狀態被拒：待處理直接轉已完成回 422 TRANSITION_NOT_ALLOWED', async () => {
    const created = (
      await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } })
    ).json().issue;
    const res = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '已完成', resolution: '已完成' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('終止狀態缺結案原因被拒：回 422 RESOLUTION_REQUIRED', async () => {
    const created = (
      await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } })
    ).json().issue;
    await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '處理中' },
    });
    await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '審查中' },
    });
    const res = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '已完成' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('RESOLUTION_REQUIRED');
  });

  it('結案原因不在選項清單被拒：回 422 RESOLUTION_NOT_ALLOWED', async () => {
    const created = (
      await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } })
    ).json().issue;
    await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '處理中' },
    });
    await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '審查中' },
    });
    const res = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '已完成', resolution: '不存在的原因' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('RESOLUTION_NOT_ALLOWED');
  });

  it('resolution 沒有 status 陪同被拒：回 422 RESOLUTION_REQUIRES_STATUS_CHANGE', async () => {
    const created = (
      await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } })
    ).json().issue;
    const res = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { resolution: '已完成' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('RESOLUTION_REQUIRES_STATUS_CHANGE');
  });

  it('審查中可退回處理中', async () => {
    const created = (
      await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } })
    ).json().issue;
    await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '處理中' },
    });
    await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '審查中' },
    });
    const res = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '處理中' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().issue.status).toBe('處理中');
  });

  it('狀態值與現況相同視為 no-op，不觸發驗證，其他欄位仍正常寫入', async () => {
    const created = (
      await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: 'A' } })
    ).json().issue;
    const res = await call({
      method: 'PATCH',
      url: `/api/workspace/issues/${created.id}`,
      payload: { status: '待處理', title: 'A 改名' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().issue.status).toBe('待處理');
    expect(res.json().issue.title).toBe('A 改名');
  });

  it('更新不存在的工單回 404', async () => {
    const res = await call({
      method: 'PATCH',
      url: '/api/workspace/issues/00000000-0000-0000-0000-000000000000',
      payload: { status: '已完成' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('租戶隔離：另一 Company 看不到本 Company 的工單，且各自有獨立工作區', async () => {
    await call({ method: 'POST', url: '/api/workspace/issues', payload: { title: '機密工單' } });
    const mine = (await call({ method: 'GET', url: '/api/workspace/issues' })).json();
    expect(mine.issues).toHaveLength(1);

    const otherCall = await makeSeparateTenant(app, pool);
    const otherWorkspace = await otherCall({ method: 'GET', url: '/api/workspace' });
    expect(otherWorkspace.statusCode).toBe(200);
    // B 租戶自種獨立工作區，工單集 id 與 A 不同。
    expect(otherWorkspace.json().issueSet.id).not.toBe(mine.issues[0]?.id);

    const otherList = await otherCall({ method: 'GET', url: '/api/workspace/issues' });
    expect(otherList.statusCode).toBe(200);
    // 看不到 A 的工單。
    expect(otherList.json().issues).toHaveLength(0);
  });
});
