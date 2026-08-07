import type { PoolClient, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FieldDef, FieldSetDef } from './types.js';
import {
  appendChangeLog,
  appendFieldRecord,
  CHANGE_LOG_FIELD_NAME,
  deleteFieldRecord,
  findFieldDef,
  findFieldRecordById,
  findFieldSet,
  insertFieldDef,
  insertFieldSet,
  listChangeLog,
  listFieldDefs,
  listFieldDefsBySet,
  listFieldRecords,
  listFieldSets,
} from './fieldRepo.js';
import { hasTestDb, makeTestPool, randomUUID, seedTenant, withRollback } from './testSupport.js';
import type { Fixture } from './testSupport.js';

// fieldRepo 整合測試：連 igotthis_test，每個 case 交易 rollback 隔離。
// 涵蓋欄位組與欄位定義讀寫、多筆記錄追加與查詢、變更歷史追加、租戶隔離。
// 工單欄位「單值」由 issueRepo 承載，不在本檔範圍。

const suite = hasTestDb ? describe : describe.skip;

/** 種一張工單，回傳其 id。 */
async function seedIssue(client: PoolClient, fx: Fixture): Promise<string> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO issues (id, company_id, issue_set_id, issue_type_id, issue_key) VALUES ($1,$2,$3,$4,$5)',
    [id, fx.companyId, fx.issueSetId, fx.issueTypeId, `K-${id.slice(0, 8)}`],
  );
  return id;
}

/** 種一個帳號當記錄作者，回傳其 id。 */
async function seedAccount(client: PoolClient, companyId: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO accounts (id, company_id, name, created_on, updated_on) VALUES ($1,$2,$3,$4,$5)',
    [id, companyId, 'Author', 0, 0],
  );
  return id;
}

/** 組一筆多筆欄位定義（kind = multi）；seedTenant 已備妥欄位組「基本」。 */
function makeMultiFieldDef(companyId: string, name: string): FieldDef {
  return {
    companyId,
    name,
    fieldSetName: '基本',
    kind: 'multi',
    valueType: '長文',
    system: false,
    readonly: false,
    rollupable: false,
    rollupFn: null,
    tracked: false,
    label: name,
  };
}

suite('fieldRepo / 整合', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await makeTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  // ----- 欄位組定義 -----

  it('寫入欄位組後可取回並列出', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const def: FieldSetDef = { companyId: fx.companyId, name: '專案', system: false };
      const written = await insertFieldSet(def, client);
      expect(written).toEqual(def);

      expect((await findFieldSet(fx.companyId, '專案', client))?.name).toBe('專案');
      const list = await listFieldSets(fx.companyId, client);
      // seedTenant 已植入「基本」，加上本次的「專案」。
      expect(list.map((s) => s.name)).toEqual(['基本', '專案']);
    });
  });

  // ----- 欄位定義 -----

  it('寫入欄位定義後可依名稱取回，rollupFn 與 kind 原樣還原', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const def: FieldDef = {
        companyId: fx.companyId,
        name: 'StartTime',
        fieldSetName: '基本',
        kind: 'single',
        valueType: '日期',
        system: false,
        readonly: false,
        rollupable: true,
        rollupFn: 'earliest',
        tracked: true,
        label: '開始日期',
      };
      const written = await insertFieldDef(def, client);
      expect(written).toEqual(def);

      const got = await findFieldDef(fx.companyId, 'StartTime', client);
      expect(got?.rollupFn).toBe('earliest');
      expect(got?.kind).toBe('single');
      expect(got?.rollupable).toBe(true);
    });
  });

  it('列出欄位定義：全部與依欄位組過濾', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      await insertFieldSet({ companyId: fx.companyId, name: '版控', system: false }, client);
      await insertFieldDef(makeMultiFieldDef(fx.companyId, 'Comment'), client);
      await insertFieldDef(
        { ...makeMultiFieldDef(fx.companyId, 'BranchName'), fieldSetName: '版控', kind: 'single', valueType: '文字' },
        client,
      );

      const all = await listFieldDefs(fx.companyId, client);
      // seedTenant 的 Title + 本次兩個。
      expect(all.map((d) => d.name)).toEqual(['BranchName', 'Comment', 'Title']);

      const inBasic = await listFieldDefsBySet(fx.companyId, '基本', client);
      expect(inBasic.map((d) => d.name)).toEqual(['Comment', 'Title']);
      const inVcs = await listFieldDefsBySet(fx.companyId, '版控', client);
      expect(inVcs.map((d) => d.name)).toEqual(['BranchName']);
    });
  });

  // ----- 多筆記錄 -----

  it('多筆欄位記錄：追加多筆後依時間取回，jsonb 值原樣還原', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      await insertFieldDef(makeMultiFieldDef(fx.companyId, 'Comment'), client);
      const issueId = await seedIssue(client, fx);
      const author = await seedAccount(client, fx.companyId);

      const values = [{ text: '第一則' }, { text: '第二則', mentions: ['a', 'b'] }, { text: '第三則' }];
      for (let i = 0; i < values.length; i += 1) {
        await appendFieldRecord(
          {
            id: randomUUID(),
            companyId: fx.companyId,
            issueId,
            fieldName: 'Comment',
            value: values[i],
            authorId: author,
            createdOn: i + 1,
          },
          client,
        );
      }

      const records = await listFieldRecords(fx.companyId, issueId, 'Comment', client);
      expect(records).toHaveLength(3);
      expect(records.map((r) => r.value)).toEqual(values);
      expect(records[0]?.authorId).toBe(author);
    });
  });

  it('多筆記錄可依 id 取回與刪除', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      await insertFieldDef(makeMultiFieldDef(fx.companyId, 'Comment'), client);
      const issueId = await seedIssue(client, fx);
      const author = await seedAccount(client, fx.companyId);
      const recordId = randomUUID();
      await appendFieldRecord(
        { id: recordId, companyId: fx.companyId, issueId, fieldName: 'Comment', value: { text: 'x' }, authorId: author, createdOn: 1 },
        client,
      );

      expect((await findFieldRecordById(fx.companyId, recordId, client))?.id).toBe(recordId);
      expect(await deleteFieldRecord(fx.companyId, recordId, client)).toBe(true);
      expect(await deleteFieldRecord(fx.companyId, recordId, client)).toBe(false);
      expect(await findFieldRecordById(fx.companyId, recordId, client)).toBeUndefined();
    });
  });

  // ----- 變更歷史 -----

  it('變更歷史追加：以 ChangeLog 多筆記錄承載，結構 JSON 原樣還原', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      await insertFieldDef(makeMultiFieldDef(fx.companyId, CHANGE_LOG_FIELD_NAME), client);
      const issueId = await seedIssue(client, fx);
      const author = await seedAccount(client, fx.companyId);

      await appendChangeLog(
        {
          id: randomUUID(),
          companyId: fx.companyId,
          issueId,
          entry: { fieldName: 'Status', oldValue: 'Open', newValue: 'Doing', actor: author, time: 100 },
          authorId: author,
          createdOn: 100,
        },
        client,
      );
      await appendChangeLog(
        {
          id: randomUUID(),
          companyId: fx.companyId,
          issueId,
          entry: { fieldName: 'Assignee', oldValue: null, newValue: author, actor: author, time: 200 },
          authorId: author,
          createdOn: 200,
        },
        client,
      );

      const log = await listChangeLog(fx.companyId, issueId, client);
      expect(log).toHaveLength(2);
      expect(log.map((r) => r.fieldName)).toEqual([CHANGE_LOG_FIELD_NAME, CHANGE_LOG_FIELD_NAME]);
      expect(log[0]?.value).toEqual({ fieldName: 'Status', oldValue: 'Open', newValue: 'Doing', actor: author, time: 100 });
      expect(log[1]?.value).toEqual({ fieldName: 'Assignee', oldValue: null, newValue: author, actor: author, time: 200 });
    });
  });

  // ----- 租戶隔離 -----

  it('租戶隔離：A 的欄位定義與記錄對 B 不可見', async () => {
    await withRollback(pool, async (client) => {
      const a = await seedTenant(client);
      const b = await seedTenant(client);
      await insertFieldDef(makeMultiFieldDef(a.companyId, 'Comment'), client);
      const issueId = await seedIssue(client, a);
      const author = await seedAccount(client, a.companyId);
      const recordId = randomUUID();
      await appendFieldRecord(
        { id: recordId, companyId: a.companyId, issueId, fieldName: 'Comment', value: { text: 'a-only' }, authorId: author, createdOn: 1 },
        client,
      );

      // B 視角：查不到 A 的欄位定義與記錄。
      expect(await findFieldDef(b.companyId, 'Comment', client)).toBeUndefined();
      expect((await listFieldDefs(b.companyId, client)).some((d) => d.name === 'Comment')).toBe(false);
      expect(await findFieldRecordById(b.companyId, recordId, client)).toBeUndefined();
      expect(await listFieldRecords(b.companyId, issueId, 'Comment', client)).toHaveLength(0);
      // A 視角：查得到。
      expect(await findFieldRecordById(a.companyId, recordId, client)).toBeDefined();
    });
  });
});
