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
  readonly mgmtId: string;
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
    return { mgmtId, issueSetId, issueTypeId };
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

  async function createView(
    name = 'My View',
    overrides: Partial<{
      sourceMgmtIds: readonly string[];
      filterConfig: unknown;
      calendarName: string | null;
    }> = {},
  ): Promise<{ id: string; ownerId: string }> {
    const res = await call({
      method: 'POST',
      url: '/api/views',
      payload: { name, viewType: 'list', sourceMgmtIds: [], displayLevel: 0, ...overrides },
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

  // ---- 手動排序 ----

  async function sortedIds(viewId: string): Promise<string[]> {
    const res = await call({ method: 'GET', url: `/api/views/${viewId}/sort` });
    expect(res.statusCode).toBe(200);
    return (res.json().entries as { issueId: string }[]).map((entry) => entry.issueId);
  }

  function place(viewId: string, issueId: string, targetIndex: number) {
    return call({
      method: 'PUT',
      url: `/api/views/${viewId}/sort/${issueId}`,
      payload: { targetIndex },
    });
  }

  it('新檢視的排序區為空', async () => {
    const view = await createView();
    expect(await sortedIds(view.id)).toEqual([]);
  });

  it('指派位置後工單進入已排序區', async () => {
    const view = await createView();
    const issue = await seedIssue(pool, session.companyId, containers);

    const res = await place(view.id, issue, 0);
    expect(res.statusCode).toBe(200);
    expect(await sortedIds(view.id)).toEqual([issue]);
  });

  it('依序插入三筆，順序與插入位置一致', async () => {
    const view = await createView();
    const [a, b, c] = await seedThree();

    await place(view.id, a, 0);
    await place(view.id, b, 1);
    await place(view.id, c, 1);

    expect(await sortedIds(view.id)).toEqual([a, c, b]);
  });

  it('重排既有項目：移到最前不重複佔位', async () => {
    const view = await createView();
    const [a, b, c] = await seedThree();
    await place(view.id, a, 0);
    await place(view.id, b, 1);
    await place(view.id, c, 2);

    await place(view.id, c, 0);

    expect(await sortedIds(view.id)).toEqual([c, a, b]);
  });

  it('重排回原位順序不變', async () => {
    const view = await createView();
    const [a, b] = await seedThree();
    await place(view.id, a, 0);
    await place(view.id, b, 1);

    expect((await place(view.id, b, 1)).statusCode).toBe(200);
    expect(await sortedIds(view.id)).toEqual([a, b]);
  });

  it('回應直接帶回更新後的排序清單', async () => {
    const view = await createView();
    const [a, b] = await seedThree();
    await place(view.id, a, 0);

    const res = await place(view.id, b, 0);
    expect((res.json().entries as { issueId: string }[]).map((e) => e.issueId)).toEqual([b, a]);
  });

  it('位置越界回 400 SORT_INDEX_OUT_OF_RANGE', async () => {
    const view = await createView();
    const issue = await seedIssue(pool, session.companyId, containers);

    const res = await place(view.id, issue, 3);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('SORT_INDEX_OUT_OF_RANGE');
  });

  it('檢視不存在回 404', async () => {
    const issue = await seedIssue(pool, session.companyId, containers);
    const res = await place(randomUUID(), issue, 0);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('VIEW_NOT_FOUND');
  });

  it('工單不存在回 404', async () => {
    const view = await createView();
    const res = await place(view.id, randomUUID(), 0);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ISSUE_NOT_FOUND');
  });

  it('租戶隔離：另一 Company 的檢視讀不到也排不動', async () => {
    const issue = await seedIssue(pool, session.companyId, containers);
    const foreignViewId = await seedForeignView();

    const read = await call({ method: 'GET', url: `/api/views/${foreignViewId}/sort` });
    expect(read.statusCode).toBe(404);

    const write = await place(foreignViewId, issue, 0);
    expect(write.statusCode).toBe(404);
  });

  it('刪除檢視連同排序項一併清除', async () => {
    const view = await createView();
    const issue = await seedIssue(pool, session.companyId, containers);
    await place(view.id, issue, 0);

    await call({ method: 'DELETE', url: `/api/views/${view.id}` });

    const rows = await pool.query('SELECT 1 FROM view_sort_entries WHERE view_id = $1', [view.id]);
    expect(rows.rowCount).toBe(0);
  });

  async function seedThree(): Promise<[string, string, string]> {
    return [
      await seedIssue(pool, session.companyId, containers),
      await seedIssue(pool, session.companyId, containers),
      await seedIssue(pool, session.companyId, containers),
    ];
  }

  /**
   * 造一張隸屬另一個 Company 的檢視。
   * 單一 Company 模式下再註冊一個帳號只會綁進同一租戶，拿不到第二個租戶，只能直插。
   */
  async function seedForeignView(): Promise<string> {
    const companyId = randomUUID();
    const accountId = randomUUID();
    const viewId = randomUUID();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1,$2)', [companyId, 'Other Co']);
    await pool.query(
      'INSERT INTO accounts (id, company_id, name, created_on, updated_on) VALUES ($1,$2,$3,$4,$5)',
      [accountId, companyId, 'Other Owner', 0, 0],
    );
    await pool.query(
      `INSERT INTO views (id, company_id, name, owner_id, view_type, source_mgmt_ids, display_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [viewId, companyId, 'Theirs', accountId, 'list', JSON.stringify([]), 0],
    );
    return viewId;
  }

  // ---- 檢視內容 ----

  async function setFieldValue(issueId: string, fieldName: string, value: unknown): Promise<void> {
    await pool.query(
      `INSERT INTO issue_field_values (company_id, issue_id, field_name, value, rollup_mode)
       VALUES ($1,$2,$3,$4,$5)`,
      [session.companyId, issueId, fieldName, JSON.stringify(value), null],
    );
  }

  async function seedCalendar(name: string, weeklyOff: readonly string[]): Promise<void> {
    await pool.query(
      'INSERT INTO calendar_definitions (company_id, name, weekly_off) VALUES ($1,$2,$3)',
      [session.companyId, name, JSON.stringify(weeklyOff)],
    );
  }

  /** 建第二個 Mgmt（各自獨立 Team/Product），在其主題單位置塞一個工單。 */
  async function seedSecondMgmtWithIssue(): Promise<{ mgmtId: string; issueId: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const teamId = randomUUID();
      const productId = randomUUID();
      const mgmtId = randomUUID();
      const issueSetId = randomUUID();
      const issueId = randomUUID();
      await client.query('INSERT INTO teams (id, company_id, name) VALUES ($1,$2,$3)', [
        teamId,
        session.companyId,
        'T2',
      ]);
      await client.query(
        'INSERT INTO products (id, company_id, team_id, name) VALUES ($1,$2,$3,$4)',
        [productId, session.companyId, teamId, 'P2'],
      );
      await client.query(
        'INSERT INTO mgmts (id, company_id, product_id, name, container_issue_set_id) VALUES ($1,$2,$3,$4,$5)',
        [mgmtId, session.companyId, productId, 'M2', issueSetId],
      );
      await client.query(
        'INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1,$2,$3,$4,$5)',
        [issueSetId, session.companyId, mgmtId, 'Backlog2', 'PROJ2'],
      );
      await client.query(
        'INSERT INTO issues (id, company_id, issue_set_id, issue_type_id, issue_key) VALUES ($1,$2,$3,$4,$5)',
        [issueId, session.companyId, issueSetId, containers.issueTypeId, `PROJ2-${issueId.slice(0, 8)}`],
      );
      await client.query('COMMIT');
      return { mgmtId, issueId };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  function issueIds(res: { sortedIssues: { id: string }[]; unsortedIssues: { id: string }[] }): string[] {
    return [...res.sortedIssues, ...res.unsortedIssues].map((row) => row.id);
  }

  it('檢視內容：檢視不存在回 404', async () => {
    const res = await call({ method: 'GET', url: `/api/views/${randomUUID()}/issues` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('VIEW_NOT_FOUND');
  });

  it('資料來源為空：兩區皆空', async () => {
    const view = await createView('Empty', { sourceMgmtIds: [] });
    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sortedIssues: [], unsortedIssues: [], excludedCount: 0 });
  });

  it('新建主題單未經排序：先進未排序區', async () => {
    const issue = await seedIssue(pool, session.companyId, containers);
    const view = await createView('V', { sourceMgmtIds: [containers.mgmtId] });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    const body = res.json();
    expect(body.sortedIssues).toEqual([]);
    expect(body.unsortedIssues.map((row: { id: string }) => row.id)).toEqual([issue]);
  });

  it('已排序項依 sortValue 升冪落 sortedIssues，其餘落未排序區', async () => {
    const [a, b, c] = await seedThree();
    const view = await createView('V', { sourceMgmtIds: [containers.mgmtId] });
    await place(view.id, a, 0);
    await place(view.id, b, 1);

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    const body = res.json();
    expect(body.sortedIssues.map((row: { id: string }) => row.id)).toEqual([a, b]);
    expect(body.unsortedIssues.map((row: { id: string }) => row.id)).toEqual([c]);
  });

  it('sourceMgmtIds 含多個 Mgmt：各自主題單皆收進資料來源', async () => {
    const first = await seedIssue(pool, session.companyId, containers);
    const { mgmtId: mgmtId2, issueId: second } = await seedSecondMgmtWithIssue();
    const view = await createView('V', { sourceMgmtIds: [containers.mgmtId, mgmtId2] });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    expect(issueIds(res.json()).sort()).toEqual([first, second].sort());
  });

  it('Mgmt 底下的一般工單集不計入，只收 containerIssueSetId 那份主題單位置', async () => {
    const otherIssueSetId = randomUUID();
    await pool.query(
      'INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1,$2,$3,$4,$5)',
      [otherIssueSetId, session.companyId, containers.mgmtId, 'Other', 'OTH'],
    );
    await pool.query(
      'INSERT INTO issues (id, company_id, issue_set_id, issue_type_id, issue_key) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), session.companyId, otherIssueSetId, containers.issueTypeId, 'OTH-1'],
    );
    const containerIssue = await seedIssue(pool, session.companyId, containers);
    const view = await createView('V', { sourceMgmtIds: [containers.mgmtId] });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    expect(issueIds(res.json())).toEqual([containerIssue]);
  });

  it('filterConfig 排除不符合條件的工單，excludedCount 反映排除數', async () => {
    const keep = await seedIssue(pool, session.companyId, containers);
    await setFieldValue(keep, 'title', 'keep-me');
    const drop = await seedIssue(pool, session.companyId, containers);
    await setFieldValue(drop, 'title', 'drop-me');

    const view = await createView('V', {
      sourceMgmtIds: [containers.mgmtId],
      filterConfig: { conditions: [{ fieldName: 'title', operator: 'equals', value: 'keep-me' }] },
    });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    const body = res.json();
    expect(issueIds(body)).toEqual([keep]);
    expect(body.excludedCount).toBe(1);
  });

  it('filterConfig 格式不符：fail-open 視為不篩選', async () => {
    const issue = await seedIssue(pool, session.companyId, containers);
    const view = await createView('V', {
      sourceMgmtIds: [containers.mgmtId],
      filterConfig: 'not-an-object',
    });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    const body = res.json();
    expect(issueIds(body)).toEqual([issue]);
    expect(body.excludedCount).toBe(0);
  });

  it('檢視選用日曆時，回傳生效日曆名稱', async () => {
    await seedCalendar('台灣', ['SAT', 'SUN']);
    const view = await createView('V', {
      sourceMgmtIds: [containers.mgmtId],
      calendarName: '台灣',
    });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    expect(res.json().calendarName).toBe('台灣');
  });

  it('檢視未選用日曆、帳號亦無預設：calendarName 為 null', async () => {
    const view = await createView('V', { sourceMgmtIds: [containers.mgmtId] });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    expect(res.json().calendarName).toBeNull();
  });

  it('工單缺 StartTime／EndTime：工期回 hasDuration false', async () => {
    const issue = await seedIssue(pool, session.companyId, containers);
    const view = await createView('V', { sourceMgmtIds: [containers.mgmtId] });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    const row = res.json().unsortedIssues[0];
    expect(row.id).toBe(issue);
    expect(row.duration).toEqual({ hasDuration: false });
  });

  it('工單有 StartTime／EndTime 且有生效日曆：工期以工作天計，扣除週末', async () => {
    await seedCalendar('台灣', ['SAT', 'SUN']);
    const issue = await seedIssue(pool, session.companyId, containers);
    // 2026-01-05 為週一，2026-01-12 為週一，中間跨一個六日。
    await setFieldValue(issue, 'StartTime', '2026-01-05');
    await setFieldValue(issue, 'EndTime', '2026-01-12');
    const view = await createView('V', {
      sourceMgmtIds: [containers.mgmtId],
      calendarName: '台灣',
    });

    const res = await call({ method: 'GET', url: `/api/views/${view.id}/issues` });
    const row = res.json().unsortedIssues[0];
    expect(row.duration).toEqual({ hasDuration: true, days: 5, unit: 'workingDay' });
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
