import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { authed, bootstrap, registerSession, testUrl, type Session } from './testHarness.js';

// 工單路由整合測試：以 Fastify inject 打真路由連 igotthis_test。
// 涵蓋工單 CRUD、取號遞增、移動保留原號、依工單集列出，與工單欄位單值讀寫。
//
// 工單型別與欄位定義無對應的 CRUD 路由，測試以 SQL 直插同租戶的 fixture。

const suite = testUrl ? describe : describe.skip;

const FIELD_NAME = 'Title';

suite('issue routes', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let session: Session;
  let call: ReturnType<typeof authed>;
  let issueSetId: string;
  let secondIssueSetId: string;
  let issueTypeId: string;

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

    // 容器骨架走真路由：team > product > mgmt + 初始工單集。
    const team = await call({ method: 'POST', url: '/api/teams', payload: { name: 'T' } });
    const teamId = team.json().team.id;
    const product = await call({
      method: 'POST',
      url: '/api/products',
      payload: { teamId, name: 'P' },
    });
    const productId = product.json().product.id;
    const mgmt = await call({
      method: 'POST',
      url: `/api/products/${productId}/mgmts`,
      payload: { name: 'M', issueSet: { name: 'Backlog', key: 'PROJ' } },
    });
    issueSetId = mgmt.json().issueSet.id;
    const mgmtId = mgmt.json().mgmt.id;

    const second = await call({
      method: 'POST',
      url: `/api/mgmts/${mgmtId}/issue-sets`,
      payload: { name: 'Sprint', key: 'SPR' },
    });
    secondIssueSetId = second.json().issueSet.id;

    // 工單型別與欄位定義直插同租戶（無對應 CRUD 路由）。
    issueTypeId = randomUUID();
    const { companyId } = session;
    await pool.query(
      'INSERT INTO issue_type_definitions (id, company_id, name, label, field_sets, system) VALUES ($1,$2,$3,$4,$5,$6)',
      [issueTypeId, companyId, 'task', 'Task', JSON.stringify(['基本']), false],
    );
    await pool.query('INSERT INTO field_set_defs (company_id, name, system) VALUES ($1,$2,$3)', [
      companyId,
      '基本',
      true,
    ]);
    await pool.query(
      `INSERT INTO field_defs
         (company_id, name, field_set_name, kind, value_type, system, readonly, rollupable, rollup_fn, tracked, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [companyId, FIELD_NAME, '基本', 'single', 'text', false, false, false, null, false, '標題'],
    );
  });

  // ---- helpers ----

  async function createIssue(setId = issueSetId): Promise<{ id: string; issueKey: string }> {
    const res = await call({
      method: 'POST',
      url: `/api/issue-sets/${setId}/issues`,
      payload: { issueTypeId },
    });
    return res.json().issue;
  }

  // ---- auth ----

  it('未帶 cookie 存取工單路由回 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/issues/${randomUUID()}` });
    expect(res.statusCode).toBe(401);
  });

  // ---- 建立與取號 ----

  it('建立工單回 201，編號為 KEY-流水號且逐次遞增', async () => {
    const first = await call({
      method: 'POST',
      url: `/api/issue-sets/${issueSetId}/issues`,
      payload: { issueTypeId },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().issue.issueKey).toBe('PROJ-1');

    const second = await createIssue();
    expect(second.issueKey).toBe('PROJ-2');
  });

  it('引用不存在的工單型別回 422 ISSUE_TYPE_NOT_FOUND', async () => {
    const res = await call({
      method: 'POST',
      url: `/api/issue-sets/${issueSetId}/issues`,
      payload: { issueTypeId: randomUUID() },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('ISSUE_TYPE_NOT_FOUND');
  });

  it('於不存在的工單集建工單回 404', async () => {
    const res = await call({
      method: 'POST',
      url: `/api/issue-sets/${randomUUID()}/issues`,
      payload: { issueTypeId },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---- 讀取與列出 ----

  it('依工單集列出工單', async () => {
    await createIssue();
    await createIssue();
    const res = await call({ method: 'GET', url: `/api/issue-sets/${issueSetId}/issues` });
    expect(res.statusCode).toBe(200);
    expect(res.json().issues).toHaveLength(2);
  });

  it('取得工單；不存在回 404', async () => {
    const issue = await createIssue();
    const got = await call({ method: 'GET', url: `/api/issues/${issue.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().issue.issueKey).toBe('PROJ-1');

    const gone = await call({ method: 'GET', url: `/api/issues/${randomUUID()}` });
    expect(gone.statusCode).toBe(404);
  });

  // ---- 移動 ----

  it('移動工單至其他工單集，編號保留原號', async () => {
    const issue = await createIssue();
    const moved = await call({
      method: 'POST',
      url: `/api/issues/${issue.id}/move`,
      payload: { issueSetId: secondIssueSetId },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().issue.issueSetId).toBe(secondIssueSetId);
    expect(moved.json().issue.issueKey).toBe('PROJ-1');
  });

  it('移動至不存在的工單集回 422 ISSUE_SET_NOT_FOUND', async () => {
    const issue = await createIssue();
    const res = await call({
      method: 'POST',
      url: `/api/issues/${issue.id}/move`,
      payload: { issueSetId: randomUUID() },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('ISSUE_SET_NOT_FOUND');
  });

  // ---- 刪除 ----

  it('刪除工單回 204，之後取得回 404', async () => {
    const issue = await createIssue();
    const removed = await call({ method: 'DELETE', url: `/api/issues/${issue.id}` });
    expect(removed.statusCode).toBe(204);
    const gone = await call({ method: 'GET', url: `/api/issues/${issue.id}` });
    expect(gone.statusCode).toBe(404);
  });

  // ---- 欄位值讀寫 ----

  it('寫入 / 取得 / 列出 / 刪除工單欄位值', async () => {
    const issue = await createIssue();

    const put = await call({
      method: 'PUT',
      url: `/api/issues/${issue.id}/fields/${FIELD_NAME}`,
      payload: { value: '修復登入頁' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().fieldValue.value).toBe('修復登入頁');

    const got = await call({ method: 'GET', url: `/api/issues/${issue.id}/fields/${FIELD_NAME}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().fieldValue.value).toBe('修復登入頁');

    const listed = await call({ method: 'GET', url: `/api/issues/${issue.id}/fields` });
    expect(listed.json().fieldValues).toHaveLength(1);

    const removed = await call({
      method: 'DELETE',
      url: `/api/issues/${issue.id}/fields/${FIELD_NAME}`,
    });
    expect(removed.statusCode).toBe(204);

    const gone = await call({ method: 'GET', url: `/api/issues/${issue.id}/fields/${FIELD_NAME}` });
    expect(gone.statusCode).toBe(404);
  });

  it('覆蓋既有欄位值', async () => {
    const issue = await createIssue();
    await call({
      method: 'PUT',
      url: `/api/issues/${issue.id}/fields/${FIELD_NAME}`,
      payload: { value: 'v1' },
    });
    const put2 = await call({
      method: 'PUT',
      url: `/api/issues/${issue.id}/fields/${FIELD_NAME}`,
      payload: { value: 'v2' },
    });
    expect(put2.json().fieldValue.value).toBe('v2');
  });

  it('寫入未定義欄位回 422 FIELD_NOT_DEFINED', async () => {
    const issue = await createIssue();
    const res = await call({
      method: 'PUT',
      url: `/api/issues/${issue.id}/fields/Undefined`,
      payload: { value: 'x' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('FIELD_NOT_DEFINED');
  });

  it('對不存在的工單寫欄位值回 404', async () => {
    const res = await call({
      method: 'PUT',
      url: `/api/issues/${randomUUID()}/fields/${FIELD_NAME}`,
      payload: { value: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});
