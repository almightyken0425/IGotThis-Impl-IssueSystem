import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadEnv } from '../env.js';
import { applyMigrations } from '../migrate.js';

import { insertAccount } from './permissionRepo.js';
import {
  newId,
  seedCompany,
  seedContainer,
  seedIssue,
  seedIssueType,
  withRollback,
} from './testFixtures.js';
import {
  deleteSortEntry,
  getView,
  insertView,
  listSortEntries,
  listViewsByCompany,
  listViewsByOwner,
  updateViewColumnConfig,
  upsertSortEntry,
  type View,
} from './viewRepo.js';

// viewRepo 整合測試：連 igotthis_test，每個 case 交易 rollback 隔離。

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];
const suite = testUrl ? describe : describe.skip;

/** 建一個帳號當檢視 owner，回傳 accountId。 */
async function seedAccount(client: import('pg').PoolClient, companyId: string): Promise<string> {
  const id = newId();
  await insertAccount(client, {
    id,
    companyId,
    name: 'Owner',
    defaultCalendarName: null,
    tags: null,
    createdOn: 0,
    updatedOn: 0,
  });
  return id;
}

function makeView(companyId: string, ownerId: string, overrides: Partial<View> = {}): View {
  return {
    id: newId(),
    companyId,
    name: 'V',
    ownerId,
    viewType: '看板',
    sourceMgmtIds: [],
    filterConfig: null,
    displayLevel: 0,
    columnConfig: null,
    calendarName: null,
    ...overrides,
  };
}

suite('viewRepo / 整合', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl });
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await applyMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('寫入檢視後可取回，jsonb 欄原樣還原', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const ownerId = await seedAccount(client, companyId);
      const view = makeView(companyId, ownerId, {
        name: '開發順序表',
        sourceMgmtIds: ['m1', 'm2'],
        filterConfig: { status: 'open' },
        displayLevel: 2,
        columnConfig: { columns: ['title', 'due'] },
        calendarName: '台灣',
      });
      await insertView(client, view);

      const got = await getView(client, companyId, view.id);
      expect(got).toEqual(view);
    });
  });

  it('null 設定存 SQL NULL、讀回 null', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const ownerId = await seedAccount(client, companyId);
      const view = makeView(companyId, ownerId);
      await insertView(client, view);

      const got = await getView(client, companyId, view.id);
      expect(got?.filterConfig).toBeNull();
      expect(got?.columnConfig).toBeNull();
      expect(got?.calendarName).toBeNull();
    });
  });

  it('updateViewColumnConfig 寫入欄位顯示設定', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const ownerId = await seedAccount(client, companyId);
      const view = makeView(companyId, ownerId);
      await insertView(client, view);

      await updateViewColumnConfig(client, companyId, view.id, {
        columns: [{ field: 'title', width: 200 }],
      });
      const got = await getView(client, companyId, view.id);
      expect(got?.columnConfig).toEqual({ columns: [{ field: 'title', width: 200 }] });
    });
  });

  it('排序：upsert 決定先後、同工單更新不重列、刪除退回未排序', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const ownerId = await seedAccount(client, companyId);
      const container = await seedContainer(client, companyId);
      const typeId = await seedIssueType(client, companyId);
      const issueA = await seedIssue(client, companyId, container.issueSetId, typeId, 'K-1');
      const issueB = await seedIssue(client, companyId, container.issueSetId, typeId, 'K-2');
      const view = makeView(companyId, ownerId);
      await insertView(client, view);

      // A 排在 B 之前
      await upsertSortEntry(client, {
        id: newId(),
        companyId,
        viewId: view.id,
        issueId: issueA,
        sortValue: 200,
      });
      await upsertSortEntry(client, {
        id: newId(),
        companyId,
        viewId: view.id,
        issueId: issueB,
        sortValue: 100,
      });

      let entries = await listSortEntries(client, companyId, view.id);
      expect(entries.map((e) => e.issueId)).toEqual([issueB, issueA]);

      // 重排 A 至最前：同 (view, issue) 更新 sortValue、不新增列
      await upsertSortEntry(client, {
        id: newId(),
        companyId,
        viewId: view.id,
        issueId: issueA,
        sortValue: 50,
      });
      entries = await listSortEntries(client, companyId, view.id);
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.issueId)).toEqual([issueA, issueB]);

      // 刪除 A：退回未排序區
      await deleteSortEntry(client, companyId, view.id, issueA);
      entries = await listSortEntries(client, companyId, view.id);
      expect(entries.map((e) => e.issueId)).toEqual([issueB]);
    });
  });

  it('listViewsByOwner 與 listViewsByCompany 各自框對範圍', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const ownerA = await seedAccount(client, companyId);
      const ownerB = await seedAccount(client, companyId);
      await insertView(client, makeView(companyId, ownerA, { name: 'A1' }));
      await insertView(client, makeView(companyId, ownerA, { name: 'A2' }));
      await insertView(client, makeView(companyId, ownerB, { name: 'B1' }));

      const byOwnerA = await listViewsByOwner(client, companyId, ownerA);
      expect(byOwnerA.map((v) => v.name)).toEqual(['A1', 'A2']);
      const byCompany = await listViewsByCompany(client, companyId);
      expect(byCompany.map((v) => v.name)).toEqual(['A1', 'A2', 'B1']);
    });
  });

  it('租戶隔離：另一 Company 看不到本 Company 的檢視與排序', async () => {
    await withRollback(pool, async (client) => {
      const companyA = await seedCompany(client, 'A');
      const companyB = await seedCompany(client, 'B');
      const ownerA = await seedAccount(client, companyA);
      const view = makeView(companyA, ownerA);
      await insertView(client, view);

      expect(await getView(client, companyB, view.id)).toBeUndefined();
      expect(await listViewsByCompany(client, companyB)).toEqual([]);
      expect(await listSortEntries(client, companyB, view.id)).toEqual([]);
    });
  });
});
