import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as issueRepo from './issueRepo.js';
import { hasTestDb, makeTestPool, randomUUID, seedTenant, withRollback } from './testSupport.js';

// 工單 repository 整合測試：連 igotthis_test，真的讀寫。
// 全走交易 rollback 隔離，測試間不互相汙染。

const suite = hasTestDb ? describe : describe.skip;

suite('issueRepo / 整合', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await makeTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  // ---------- Issues CRUD + 移動 ----------

  it('Issue：建立、讀取、依 key 讀取、依工單集列出', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      const id = randomUUID();
      const created = await issueRepo.createIssue(
        {
          id,
          companyId: f.companyId,
          issueSetId: f.issueSetId,
          issueTypeId: f.issueTypeId,
          issueKey: 'FIX-1',
        },
        tx,
      );
      expect(created.issueKey).toBe('FIX-1');

      expect(await issueRepo.getIssue(f.companyId, id, tx)).toEqual(created);
      expect(await issueRepo.getIssueByKey(f.companyId, 'FIX-1', tx)).toEqual(created);

      const list = await issueRepo.listIssuesByIssueSet(f.companyId, f.issueSetId, tx);
      expect(list.map((i) => i.id)).toEqual([id]);
    });
  });

  it('moveIssue：移至其他工單集、保留原編號', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      const otherSetId = randomUUID();
      await tx.query(
        'INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1,$2,$3,$4,$5)',
        [otherSetId, f.companyId, f.mgmtId, 'Other', 'OTH'],
      );
      const id = randomUUID();
      await issueRepo.createIssue(
        {
          id,
          companyId: f.companyId,
          issueSetId: f.issueSetId,
          issueTypeId: f.issueTypeId,
          issueKey: 'FIX-7',
        },
        tx,
      );

      const moved = await issueRepo.moveIssue(f.companyId, id, otherSetId, tx);
      expect(moved?.issueSetId).toBe(otherSetId);
      expect(moved?.issueKey).toBe('FIX-7');

      expect(await issueRepo.deleteIssue(f.companyId, id, tx)).toBe(true);
      expect(await issueRepo.getIssue(f.companyId, id, tx)).toBeUndefined();
    });
  });

  // ---------- IssueTypeDefinitions ----------

  it('IssueType：建立、依 name 讀取、更新 label 與欄位組', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      const id = randomUUID();
      const created = await issueRepo.createIssueType(
        {
          id,
          companyId: f.companyId,
          name: 'bug',
          label: 'Bug',
          fieldSets: ['基本', '缺陷'],
          system: false,
        },
        tx,
      );
      expect(created.fieldSets).toEqual(['基本', '缺陷']);

      const byName = await issueRepo.getIssueTypeByName(f.companyId, 'bug', tx);
      expect(byName?.id).toBe(id);

      const updated = await issueRepo.updateIssueType(
        f.companyId,
        id,
        { label: 'Defect', fieldSets: ['基本'] },
        tx,
      );
      expect(updated?.label).toBe('Defect');
      expect(updated?.fieldSets).toEqual(['基本']);
      // 識別名稱與系統旗標不受更新影響。
      expect(updated?.name).toBe('bug');
    });
  });

  // ---------- WorkflowStates / Transitions ----------

  it('replaceWorkflowStates / Transitions：整批寫入與讀回', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);

      const states = await issueRepo.replaceWorkflowStates(
        f.companyId,
        f.issueTypeId,
        [
          { name: '待處理', sortOrder: 1, isInitial: true, isTerminal: false },
          { name: '處理中', sortOrder: 2, isInitial: false, isTerminal: false },
          { name: '已關閉', sortOrder: 3, isInitial: false, isTerminal: true },
        ],
        tx,
      );
      expect(states.map((s) => s.name)).toEqual(['待處理', '處理中', '已關閉']);

      const transitions = await issueRepo.replaceWorkflowTransitions(
        f.companyId,
        f.issueTypeId,
        [
          { fromState: '待處理', toState: '處理中', requiredRole: null, requiredFields: [] },
          {
            fromState: '處理中',
            toState: '已關閉',
            requiredRole: null,
            requiredFields: ['Resolution'],
          },
        ],
        tx,
      );
      expect(transitions).toHaveLength(2);
      const closing = transitions.find((t) => t.toState === '已關閉');
      expect(closing?.requiredFields).toEqual(['Resolution']);
      expect(closing?.requiredRole).toBeNull();

      // 縮短狀態清單前先清空引用它的轉換，否則 from/to 外鍵擋下刪除。
      await issueRepo.replaceWorkflowTransitions(f.companyId, f.issueTypeId, [], tx);
      // 再次取代為更短清單，先刪後插，數量收斂。
      const shorter = await issueRepo.replaceWorkflowStates(
        f.companyId,
        f.issueTypeId,
        [{ name: '單一', sortOrder: 1, isInitial: true, isTerminal: true }],
        tx,
      );
      expect(shorter).toHaveLength(1);
    });
  });

  // ---------- ResolutionOptions ----------

  it('replaceResolutionOptions：整批寫入與讀回', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      const options = await issueRepo.replaceResolutionOptions(
        f.companyId,
        f.issueTypeId,
        [
          { value: '已完成', sortOrder: 1, system: true },
          { value: '不做', sortOrder: 2, system: true },
        ],
        tx,
      );
      expect(options.map((o) => o.value)).toEqual(['已完成', '不做']);

      const read = await issueRepo.listResolutionOptions(f.companyId, f.issueTypeId, tx);
      expect(read.map(({ value, sortOrder }) => ({ value, sortOrder }))).toEqual([
        { value: '已完成', sortOrder: 1 },
        { value: '不做', sortOrder: 2 },
      ]);
    });
  });

  // ---------- initializeTypeWorkflow ----------

  it('initializeTypeWorkflow：無來源時帶入預設四狀態流程與結案原因', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      const result = await issueRepo.initializeTypeWorkflow(f.companyId, f.issueTypeId, undefined, tx);

      expect(result.states.map((s) => s.name)).toEqual(['待處理', '處理中', '審查中', '已完成']);
      expect(result.states.find((s) => s.isInitial)?.name).toBe('待處理');
      expect(result.states.find((s) => s.isTerminal)?.name).toBe('已完成');
      expect(result.transitions).toHaveLength(4);
      expect(new Set(result.resolutionOptions.map((o) => o.value))).toEqual(new Set(['已完成', '不做']));
      expect(result.resolutionOptions.every((o) => !o.system)).toBe(true);
    });
  });

  it('initializeTypeWorkflow：帶來源時全份複製既有型別的流程，複製結果與來源各自獨立', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      await issueRepo.initializeTypeWorkflow(f.companyId, f.issueTypeId, undefined, tx);

      const newTypeId = randomUUID();
      await issueRepo.createIssueType(
        { id: newTypeId, companyId: f.companyId, name: 'bug', label: 'Bug', fieldSets: ['基本'], system: false },
        tx,
      );
      const copied = await issueRepo.initializeTypeWorkflow(f.companyId, newTypeId, f.issueTypeId, tx);

      expect(copied.states.map((s) => s.name)).toEqual(['待處理', '處理中', '審查中', '已完成']);
      expect(copied.transitions).toHaveLength(4);
      expect(copied.resolutionOptions.map(({ value, sortOrder }) => ({ value, sortOrder }))).toEqual([
        { value: '已完成', sortOrder: 1 },
        { value: '不做', sortOrder: 2 },
      ]);

      // 複製後互相獨立：改來源不動複製結果。
      await issueRepo.replaceWorkflowStates(
        f.companyId,
        f.issueTypeId,
        [{ name: '單一', sortOrder: 1, isInitial: true, isTerminal: true }],
        tx,
      );
      const copiedStates = await issueRepo.listWorkflowStates(f.companyId, newTypeId, tx);
      expect(copiedStates).toHaveLength(4);
    });
  });

  // ---------- 工單欄位值 ----------

  it('工單欄位值：設定、覆蓋、讀取、刪除', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      const issueId = randomUUID();
      await issueRepo.createIssue(
        {
          id: issueId,
          companyId: f.companyId,
          issueSetId: f.issueSetId,
          issueTypeId: f.issueTypeId,
          issueKey: 'FIX-9',
        },
        tx,
      );

      const set1 = await issueRepo.setFieldValue(
        { companyId: f.companyId, issueId, fieldName: f.fieldName, value: '第一版標題' },
        tx,
      );
      expect(set1.value).toBe('第一版標題');
      expect(set1.rollupMode).toBeNull();

      // upsert 覆蓋同 (issue, field)。
      await issueRepo.setFieldValue(
        { companyId: f.companyId, issueId, fieldName: f.fieldName, value: '第二版標題' },
        tx,
      );
      const got = await issueRepo.getFieldValue(f.companyId, issueId, f.fieldName, tx);
      expect(got?.value).toBe('第二版標題');

      const all = await issueRepo.listFieldValues(f.companyId, issueId, tx);
      expect(all).toHaveLength(1);

      expect(await issueRepo.deleteFieldValue(f.companyId, issueId, f.fieldName, tx)).toBe(true);
      expect(await issueRepo.listFieldValues(f.companyId, issueId, tx)).toHaveLength(0);
    });
  });

  it('工單欄位值：jsonb 保存非字串型別（數字、物件）', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      // 追加一個數字欄位定義。
      await tx.query(
        `INSERT INTO field_defs
           (company_id, name, field_set_name, kind, value_type, system, readonly, rollupable, rollup_fn, tracked, label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [f.companyId, 'StoryPoint', '基本', 'single', 'number', false, false, true, 'sum', false, '點數'],
      );
      const issueId = randomUUID();
      await issueRepo.createIssue(
        {
          id: issueId,
          companyId: f.companyId,
          issueSetId: f.issueSetId,
          issueTypeId: f.issueTypeId,
          issueKey: 'FIX-11',
        },
        tx,
      );

      const saved = await issueRepo.setFieldValue(
        {
          companyId: f.companyId,
          issueId,
          fieldName: 'StoryPoint',
          value: 8,
          rollupMode: 'manual',
        },
        tx,
      );
      expect(saved.value).toBe(8);
      expect(saved.rollupMode).toBe('manual');

      const got = await issueRepo.getFieldValue(f.companyId, issueId, 'StoryPoint', tx);
      expect(got?.value).toBe(8);
    });
  });

  // ---------- 租戶隔離 ----------

  it('租戶隔離：跨 Company 讀不到工單與型別、列表只含自己', async () => {
    await withRollback(pool, async (tx) => {
      const a = await seedTenant(tx);
      const b = await seedTenant(tx);

      const aIssueId = randomUUID();
      await issueRepo.createIssue(
        {
          id: aIssueId,
          companyId: a.companyId,
          issueSetId: a.issueSetId,
          issueTypeId: a.issueTypeId,
          issueKey: 'FIX-1',
        },
        tx,
      );
      const bIssueId = randomUUID();
      await issueRepo.createIssue(
        {
          id: bIssueId,
          companyId: b.companyId,
          issueSetId: b.issueSetId,
          issueTypeId: b.issueTypeId,
          issueKey: 'FIX-1',
        },
        tx,
      );

      // A 租戶讀不到 B 的工單，即使 issueKey 同值。
      expect(await issueRepo.getIssue(a.companyId, bIssueId, tx)).toBeUndefined();
      expect(await issueRepo.getIssueByKey(a.companyId, 'FIX-1', tx)).toEqual(
        await issueRepo.getIssue(a.companyId, aIssueId, tx),
      );

      // A 讀不到 B 的工單型別。
      expect(await issueRepo.getIssueType(a.companyId, b.issueTypeId, tx)).toBeUndefined();

      // 列表只含自己租戶。
      const aList = await issueRepo.listIssuesByIssueSet(a.companyId, a.issueSetId, tx);
      expect(aList.map((i) => i.id)).toEqual([aIssueId]);

      // 跨租戶移動、刪除無效。
      expect(await issueRepo.moveIssue(a.companyId, bIssueId, a.issueSetId, tx)).toBeUndefined();
      expect(await issueRepo.deleteIssue(a.companyId, bIssueId, tx)).toBe(false);
      expect(await issueRepo.getIssue(b.companyId, bIssueId, tx)).toBeDefined();
    });
  });
});
