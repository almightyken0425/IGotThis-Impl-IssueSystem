import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { authed, bootstrap, registerSession, testUrl, type Session } from './testHarness.js';

// 檢視路由整合測試：以 Fastify inject 打真路由連 igotthis_test。
// 涵蓋檢視 CRUD、看板欄序（buildKanbanColumns）、彙總值（computeRollupValue）與彙總錯誤碼。
//
// 容器骨架、工單、流程狀態、欄位值以 SQL 直插同租戶；關聯與欄位定義走真路由建立。

const suite = testUrl ? describe : describe.skip;

interface Containers {
  readonly issueSetId: string;
  readonly issueTypeId: string;
}

async function seedContainers(pool: Pool, companyId: string): Promise<Containers> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const teamId = randomUUID();
    const productId = randomUUID();
    const mgmtId = randomUUID();
    const issueSetId = randomUUID();
    const issueTypeId = randomUUID();
    await client.query('INSERT INTO teams (id, company_id, name) VALUES ($1,$2,$3)', [
      teamId,
      companyId,
      'T',
    ]);
    await client.query(
      'INSERT INTO products (id, company_id, team_id, name) VALUES ($1,$2,$3,$4)',
      [productId, companyId, teamId, 'P'],
    );
    await client.query(
      'INSERT INTO mgmts (id, company_id, product_id, name, container_issue_set_id) VALUES ($1,$2,$3,$4,$5)',
      [mgmtId, companyId, productId, 'M', issueSetId],
    );
    await client.query(
      'INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1,$2,$3,$4,$5)',
      [issueSetId, companyId, mgmtId, 'Backlog', 'PROJ'],
    );
    await client.query(
      'INSERT INTO issue_type_definitions (id, company_id, name, label, field_sets, system) VALUES ($1,$2,$3,$4,$5,$6)',
      [issueTypeId, companyId, 'task', 'Task', JSON.stringify([]), false],
    );
    await client.query('COMMIT');
    return { issueSetId, issueTypeId };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function seedIssue(pool: Pool, companyId: string, c: Containers): Promise<string> {
  const id = randomUUID();
  await pool.query(
    'INSERT INTO issues (id, company_id, issue_set_id, issue_type_id, issue_key) VALUES ($1,$2,$3,$4,$5)',
    [id, companyId, c.issueSetId, c.issueTypeId, `PROJ-${id.slice(0, 8)}`],
  );
  return id;
}

suite('view routes', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let session: Session;
  let call: ReturnType<typeof authed>;
  let containers: Containers;

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
    containers = await seedContainers(pool, session.companyId);
  });

  async function createView(name = 'My View'): Promise<{ id: string; ownerId: string }> {
    const res = await call({
      method: 'POST',
      url: '/api/views',
      payload: { name, viewType: 'list', sourceMgmtIds: [], displayLevel: 0 },
    });
    expect(res.statusCode).toBe(201);
    return res.json().view;
  }

  // ---- auth ----

  it('未帶 cookie 存取檢視路由回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/views' });
    expect(res.statusCode).toBe(401);
  });

  // ---- 檢視 CRUD ----

  it('建立檢視回 201，擁有者為當前帳號', async () => {
    const view = await createView();
    expect(view.ownerId).toBe(session.accountId);
  });

  it('列出自己擁有的檢視', async () => {
    await createView('A');
    await createView('B');
    const res = await call({ method: 'GET', url: '/api/views' });
    expect(res.statusCode).toBe(200);
    expect(res.json().views).toHaveLength(2);
  });

  it('取單一檢視；不存在回 404', async () => {
    const view = await createView();
    const got = await call({ method: 'GET', url: `/api/views/${view.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().view.id).toBe(view.id);

    const gone = await call({ method: 'GET', url: `/api/views/${randomUUID()}` });
    expect(gone.statusCode).toBe(404);
  });

  it('更新檢視欄位顯示設定；不存在回 404', async () => {
    const view = await createView();
    const patched = await call({
      method: 'PATCH',
      url: `/api/views/${view.id}`,
      payload: { columnConfig: { columns: ['Title'] } },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().view.columnConfig).toEqual({ columns: ['Title'] });

    const gone = await call({
      method: 'PATCH',
      url: `/api/views/${randomUUID()}`,
      payload: { columnConfig: {} },
    });
    expect(gone.statusCode).toBe(404);
  });

  it('刪除檢視回 204，再刪回 404', async () => {
    const view = await createView();
    const removed = await call({ method: 'DELETE', url: `/api/views/${view.id}` });
    expect(removed.statusCode).toBe(204);
    const again = await call({ method: 'DELETE', url: `/api/views/${view.id}` });
    expect(again.statusCode).toBe(404);
  });

  // ---- 看板欄序 ----

  it('看板欄序由工單型別的流程狀態保序併入', async () => {
    const states: readonly [string, number][] = [
      ['Todo', 0],
      ['Doing', 1],
      ['Done', 2],
    ];
    for (const [name, order] of states) {
      await pool.query(
        `INSERT INTO workflow_states (company_id, issue_type_id, name, sort_order, is_initial, is_terminal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [session.companyId, containers.issueTypeId, name, order, order === 0, order === 2],
      );
    }
    const res = await call({ method: 'GET', url: '/api/views/kanban-columns' });
    expect(res.statusCode).toBe(200);
    expect(res.json().columns.map((c: { name: string }) => c.name)).toEqual([
      'Todo',
      'Doing',
      'Done',
    ]);
  });

  // ---- 彙總 ----

  async function setupRollupField(): Promise<void> {
    await call({ method: 'POST', url: '/api/fields/sets', payload: { name: '基本' } });
    await call({
      method: 'POST',
      url: '/api/fields/defs',
      payload: {
        name: 'StoryPoint',
        fieldSetName: '基本',
        kind: 'single',
        valueType: 'number',
        label: '點數',
        rollupable: true,
        rollupFn: 'sum',
      },
    });
  }

  async function setStoryPoint(issueId: string, value: number): Promise<void> {
    await pool.query(
      `INSERT INTO issue_field_values (company_id, issue_id, field_name, value, rollup_mode)
       VALUES ($1,$2,$3,$4,$5)`,
      [session.companyId, issueId, 'StoryPoint', JSON.stringify(value), null],
    );
  }

  it('彙總沿母子關聯加總下級點數', async () => {
    await setupRollupField();
    const children = await call({
      method: 'POST',
      url: '/api/relations/types',
      payload: { name: 'Children', exclusive: true, acyclic: true, ordered: true, rollup: true },
    });
    const relTypeId = children.json().relationType.id;

    const parent = await seedIssue(pool, session.companyId, containers);
    const c1 = await seedIssue(pool, session.companyId, containers);
    const c2 = await seedIssue(pool, session.companyId, containers);
    for (const child of [c1, c2]) {
      const res = await call({
        method: 'POST',
        url: '/api/relations/edges',
        payload: { fromIssueId: parent, toIssueId: child, relationTypeId: relTypeId },
      });
      expect(res.statusCode).toBe(201);
    }
    await setStoryPoint(c1, 3);
    await setStoryPoint(c2, 5);

    const res = await call({
      method: 'GET',
      url: `/api/views/rollup?issueId=${parent}&fieldName=StoryPoint`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe(8);
  });

  it('彙總不可彙總欄位回 422 FIELD_NOT_ROLLUPABLE', async () => {
    await call({ method: 'POST', url: '/api/fields/sets', payload: { name: '基本' } });
    await call({
      method: 'POST',
      url: '/api/fields/defs',
      payload: { name: 'Note', fieldSetName: '基本', kind: 'single', valueType: 'text', label: '備註' },
    });
    const issue = await seedIssue(pool, session.companyId, containers);
    const res = await call({
      method: 'GET',
      url: `/api/views/rollup?issueId=${issue}&fieldName=Note`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('FIELD_NOT_ROLLUPABLE');
  });

  it('彙總未定義欄位回 422 FIELD_NOT_DEFINED', async () => {
    const issue = await seedIssue(pool, session.companyId, containers);
    const res = await call({
      method: 'GET',
      url: `/api/views/rollup?issueId=${issue}&fieldName=Ghost`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('FIELD_NOT_DEFINED');
  });
});
