import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { authed, bootstrap, registerSession, testUrl, type Session } from './testHarness.js';

// 容器骨架路由整合測試：以 Fastify inject 打真路由連 igotthis_test。
// 涵蓋 Company / Team / Product / Mgmt / IssueSet 的 CRUD、租戶範圍、KEY 驗證與撞號。

const suite = testUrl ? describe : describe.skip;

suite('container routes', () => {
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
    await call({ method: 'GET', url: '/api/workspace' });
  });

  // ---- helpers ----

  async function createTeam(name = 'Team A'): Promise<string> {
    const res = await call({ method: 'POST', url: '/api/teams', payload: { name } });
    return res.json().team.id;
  }

  async function createProduct(teamId: string, name = 'Product A'): Promise<string> {
    const res = await call({ method: 'POST', url: '/api/products', payload: { teamId, name } });
    return res.json().product.id;
  }

  async function createMgmt(
    productId: string,
    name = 'Mgmt A',
    key = 'PROJ',
  ): Promise<{ mgmtId: string; issueSetId: string }> {
    const res = await call({
      method: 'POST',
      url: `/api/products/${productId}/mgmts`,
      payload: { name, issueSet: { name: 'Backlog', key } },
    });
    const body = res.json();
    return { mgmtId: body.mgmt.id, issueSetId: body.issueSet.id };
  }

  // ---- auth 範圍 ----

  it('未帶 cookie 存取受保護路由回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/teams' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  // ---- Company ----

  it('GET /company 回當前租戶；PATCH 改名', async () => {
    const got = await call({ method: 'GET', url: '/api/company' });
    expect(got.statusCode).toBe(200);
    expect(got.json().company.id).toBe(session.companyId);

    const renamed = await call({ method: 'PATCH', url: '/api/company', payload: { name: 'NewCo' } });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().company.name).toBe('NewCo');
  });

  // ---- Team CRUD ----

  it('Team 建立 / 列出 / 取得 / 改名 / 刪除', async () => {
    const created = await call({ method: 'POST', url: '/api/teams', payload: { name: 'Team A' } });
    expect(created.statusCode).toBe(201);
    const teamId = created.json().team.id;
    expect(created.json().team.companyId).toBe(session.companyId);

    const listed = await call({ method: 'GET', url: '/api/teams' });
    expect(listed.json().teams).toHaveLength(2);

    const got = await call({ method: 'GET', url: `/api/teams/${teamId}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().team.name).toBe('Team A');

    const renamed = await call({
      method: 'PATCH',
      url: `/api/teams/${teamId}`,
      payload: { name: 'Team B' },
    });
    expect(renamed.json().team.name).toBe('Team B');

    const removed = await call({ method: 'DELETE', url: `/api/teams/${teamId}` });
    expect(removed.statusCode).toBe(204);

    const gone = await call({ method: 'GET', url: `/api/teams/${teamId}` });
    expect(gone.statusCode).toBe(404);
  });

  it('取不存在的 Team 回 404；非 uuid 的 id 回 400', async () => {
    const notFound = await call({ method: 'GET', url: `/api/teams/${randomUUID()}` });
    expect(notFound.statusCode).toBe(404);

    const badId = await call({ method: 'GET', url: '/api/teams/not-a-uuid' });
    expect(badId.statusCode).toBe(400);
    expect(badId.json().error.code).toBe('INVALID_INPUT');
  });

  // ---- Product CRUD ----

  it('Product 建立 / 依 Team 列出 / 改名 / 刪除', async () => {
    const teamId = await createTeam();
    const created = await call({
      method: 'POST',
      url: '/api/products',
      payload: { teamId, name: 'Product A' },
    });
    expect(created.statusCode).toBe(201);
    const productId = created.json().product.id;

    const listed = await call({ method: 'GET', url: `/api/teams/${teamId}/products` });
    expect(listed.json().products).toHaveLength(1);

    const renamed = await call({
      method: 'PATCH',
      url: `/api/products/${productId}`,
      payload: { name: 'Product B' },
    });
    expect(renamed.json().product.name).toBe('Product B');

    const removed = await call({ method: 'DELETE', url: `/api/products/${productId}` });
    expect(removed.statusCode).toBe(204);
  });

  it('引用不存在的 Team 建 Product 回 422 TEAM_NOT_FOUND', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/products',
      payload: { teamId: randomUUID(), name: 'X' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('TEAM_NOT_FOUND');
  });

  // ---- Mgmt CRUD（連帶初始工單集）----

  it('建 Mgmt 連帶初始工單集，回 mgmt 與 issueSet', async () => {
    const teamId = await createTeam();
    const productId = await createProduct(teamId);
    const res = await call({
      method: 'POST',
      url: `/api/products/${productId}/mgmts`,
      payload: { name: 'Mgmt A', issueSet: { name: 'Backlog', key: 'PROJ' } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.mgmt.containerIssueSetId).toBe(body.issueSet.id);
    expect(body.issueSet.key).toBe('PROJ');

    const listed = await call({ method: 'GET', url: `/api/products/${productId}/mgmts` });
    expect(listed.json().mgmts).toHaveLength(1);
  });

  it('Mgmt 取得 / 改名 / 刪除', async () => {
    const teamId = await createTeam();
    const productId = await createProduct(teamId);
    const { mgmtId } = await createMgmt(productId);

    const got = await call({ method: 'GET', url: `/api/mgmts/${mgmtId}` });
    expect(got.statusCode).toBe(200);

    const renamed = await call({
      method: 'PATCH',
      url: `/api/mgmts/${mgmtId}`,
      payload: { name: 'Mgmt Z' },
    });
    expect(renamed.json().mgmt.name).toBe('Mgmt Z');
  });

  it('建 Mgmt 的初始工單集 KEY 非法回 422（數字開頭）', async () => {
    const teamId = await createTeam();
    const productId = await createProduct(teamId);
    const res = await call({
      method: 'POST',
      url: `/api/products/${productId}/mgmts`,
      payload: { name: 'M', issueSet: { name: 'B', key: '1BAD' } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('LEADING_DIGIT');
  });

  it('引用不存在的 Product 建 Mgmt 回 422 PRODUCT_NOT_FOUND', async () => {
    const res = await call({
      method: 'POST',
      url: `/api/products/${randomUUID()}/mgmts`,
      payload: { name: 'M', issueSet: { name: 'B', key: 'PROJ' } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('PRODUCT_NOT_FOUND');
  });

  // ---- IssueSet CRUD ----

  it('IssueSet 於 Mgmt 下建立 / 列出 / 改名 / 刪除', async () => {
    const teamId = await createTeam();
    const productId = await createProduct(teamId);
    const { mgmtId } = await createMgmt(productId);

    const created = await call({
      method: 'POST',
      url: `/api/mgmts/${mgmtId}/issue-sets`,
      payload: { name: 'Sprint 1', key: 'SPR' },
    });
    expect(created.statusCode).toBe(201);
    const issueSetId = created.json().issueSet.id;

    // 初始工單集 + 新建的一個 = 2。
    const listed = await call({ method: 'GET', url: `/api/mgmts/${mgmtId}/issue-sets` });
    expect(listed.json().issueSets).toHaveLength(2);

    const renamed = await call({
      method: 'PATCH',
      url: `/api/issue-sets/${issueSetId}`,
      payload: { name: 'Sprint 2' },
    });
    expect(renamed.json().issueSet.name).toBe('Sprint 2');

    const removed = await call({ method: 'DELETE', url: `/api/issue-sets/${issueSetId}` });
    expect(removed.statusCode).toBe(204);
  });

  it('同 Company 內工單集 KEY 撞號回 409 DUPLICATE_KEY', async () => {
    const teamId = await createTeam();
    const productId = await createProduct(teamId);
    const { mgmtId } = await createMgmt(productId, 'Mgmt A', 'DUP');

    const res = await call({
      method: 'POST',
      url: `/api/mgmts/${mgmtId}/issue-sets`,
      payload: { name: 'Another', key: 'DUP' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DUPLICATE_KEY');
  });

  it('工單集 KEY 含小寫回 422 INVALID_CHARACTER', async () => {
    const teamId = await createTeam();
    const productId = await createProduct(teamId);
    const { mgmtId } = await createMgmt(productId);

    const res = await call({
      method: 'POST',
      url: `/api/mgmts/${mgmtId}/issue-sets`,
      payload: { name: 'X', key: 'abc' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_CHARACTER');
  });

  // ---- 租戶範圍 ----

  it('另一 Company 的 Team 不可見（跨租戶隔離）', async () => {
    // 直接植入第二個 Company 與其 Team，模擬另一租戶。
    const otherCompany = randomUUID();
    const otherTeam = randomUUID();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [otherCompany, 'OtherCo']);
    await pool.query('INSERT INTO teams (id, company_id, name) VALUES ($1, $2, $3)', [
      otherTeam,
      otherCompany,
      'OtherTeam',
    ]);

    // 當前 session 建自己的一個 Team。
    await createTeam('MyTeam');

    // 列表只含自己租戶的 Team。
    const listed = await call({ method: 'GET', url: '/api/teams' });
    expect(listed.json().teams).toHaveLength(2);
    expect(listed.json().teams).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'MyTeam' })]));

    // 直接以 id 取另一租戶的 Team 也不可見。
    const cross = await call({ method: 'GET', url: `/api/teams/${otherTeam}` });
    expect(cross.statusCode).toBe(404);
  });
});
