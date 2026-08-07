import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTransaction } from '../client.js';
import * as containerRepo from './containerRepo.js';
import { hasTestDb, makeTestPool, randomUUID, seedTenant, withRollback } from './testSupport.js';

// 容器骨架 repository 整合測試：連 igotthis_test，真的讀寫。
// 多數 case 走交易 rollback 隔離；併發取號需跨連線提交、自備清理。

const suite = hasTestDb ? describe : describe.skip;

suite('containerRepo / 整合', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await makeTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  // ---------- Companies CRUD ----------

  it('Company：建立、讀取、改名、刪除', async () => {
    await withRollback(pool, async (tx) => {
      const id = randomUUID();
      const created = await containerRepo.createCompany({ id, name: 'Acme' }, tx);
      expect(created).toEqual({ id, name: 'Acme' });

      expect(await containerRepo.getCompany(id, tx)).toEqual({ id, name: 'Acme' });

      const renamed = await containerRepo.renameCompany(id, 'Acme Corp', tx);
      expect(renamed?.name).toBe('Acme Corp');

      expect(await containerRepo.deleteCompany(id, tx)).toBe(true);
      expect(await containerRepo.getCompany(id, tx)).toBeUndefined();
    });
  });

  // ---------- Team / Product CRUD + 歸屬 ----------

  it('Team、Product：建立與依歸屬查詢', async () => {
    await withRollback(pool, async (tx) => {
      const { companyId, teamId } = await seedTenant(tx);

      const team = await containerRepo.getTeam(companyId, teamId, tx);
      expect(team?.companyId).toBe(companyId);

      const p2 = await containerRepo.createProduct(
        { id: randomUUID(), companyId, teamId, name: 'Product B' },
        tx,
      );
      const products = await containerRepo.listProductsByTeam(companyId, teamId, tx);
      expect(products.map((p) => p.id)).toContain(p2.id);
      expect(products.every((p) => p.teamId === teamId)).toBe(true);
    });
  });

  // ---------- Mgmt + IssueSet 環狀 FK 引導 ----------

  it('createMgmtWithInitialIssueSet：環狀 FK 於同交易內閉環', async () => {
    await withRollback(pool, async (tx) => {
      const companyId = randomUUID();
      const teamId = randomUUID();
      const productId = randomUUID();
      await containerRepo.createCompany({ id: companyId, name: 'C' }, tx);
      await containerRepo.createTeam({ id: teamId, companyId, name: 'T' }, tx);
      await containerRepo.createProduct({ id: productId, companyId, teamId, name: 'P' }, tx);

      const mgmtId = randomUUID();
      const issueSetId = randomUUID();
      const { mgmt, issueSet } = await containerRepo.createMgmtWithInitialIssueSet(
        {
          mgmt: { id: mgmtId, companyId, productId, name: 'Requirement' },
          issueSet: { id: issueSetId, companyId, name: 'Backlog', key: 'REQ' },
        },
        tx,
      );

      expect(mgmt.containerIssueSetId).toBe(issueSetId);
      expect(issueSet.mgmtId).toBe(mgmtId);
      expect(issueSet.nextSeq).toBe(1);

      const mgmts = await containerRepo.listMgmtsByProduct(companyId, productId, tx);
      expect(mgmts.map((m) => m.id)).toEqual([mgmtId]);
    });
  });

  it('提交路徑：createMgmtWithInitialIssueSet 於 COMMIT 時通過 deferred 約束', async () => {
    // rollback 隔離不會觸發 COMMIT 期的 deferred 檢核；此 case 真的提交一次以驗證閉環，收尾清理。
    const companyId = randomUUID();
    const teamId = randomUUID();
    const productId = randomUUID();
    const mgmtId = randomUUID();
    const issueSetId = randomUUID();
    try {
      await withTransaction(async (tx) => {
        await containerRepo.createCompany({ id: companyId, name: 'CommitCo' }, tx);
        await containerRepo.createTeam({ id: teamId, companyId, name: 'T' }, tx);
        await containerRepo.createProduct({ id: productId, companyId, teamId, name: 'P' }, tx);
        await containerRepo.createMgmtWithInitialIssueSet(
          {
            mgmt: { id: mgmtId, companyId, productId, name: 'M' },
            issueSet: { id: issueSetId, companyId, name: 'S', key: 'CMT' },
          },
          tx,
        );
      }, pool);

      const persisted = await containerRepo.getMgmt(companyId, mgmtId, pool);
      expect(persisted?.containerIssueSetId).toBe(issueSetId);
    } finally {
      // 單交易內反向刪除；mgmt<->issue_set 的環狀 FK 為 deferred，於 COMMIT 一次檢核。
      await withTransaction(async (tx) => {
        await tx.query('DELETE FROM issue_sets WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM mgmts WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM products WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM teams WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM companies WHERE id = $1', [companyId]);
      }, pool);
    }
  });

  // ---------- 樹狀查詢 ----------

  it('getContainerTree：組出 Company > Team > Product > Mgmt > IssueSet 巢狀樹', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      // 追加第二個工單集掛同一 Mgmt。
      await containerRepo.createIssueSet(
        { id: randomUUID(), companyId: f.companyId, mgmtId: f.mgmtId, name: 'Second', key: 'SEC' },
        tx,
      );

      const tree = await containerRepo.getContainerTree(f.companyId, tx);
      expect(tree?.id).toBe(f.companyId);
      expect(tree?.teams).toHaveLength(1);

      const team = tree!.teams[0]!;
      expect(team.id).toBe(f.teamId);
      expect(team.products).toHaveLength(1);

      const product = team.products[0]!;
      expect(product.mgmts).toHaveLength(1);

      const mgmt = product.mgmts[0]!;
      expect(mgmt.id).toBe(f.mgmtId);
      expect(mgmt.issueSets).toHaveLength(2);
      expect(mgmt.issueSets.map((s) => s.key).sort()).toEqual(['FIX', 'SEC']);
    });
  });

  it('getContainerTree：Company 不存在回 undefined', async () => {
    await withRollback(pool, async (tx) => {
      expect(await containerRepo.getContainerTree(randomUUID(), tx)).toBeUndefined();
    });
  });

  // ---------- 租戶隔離 ----------

  it('租戶隔離：不同 Company 的資料互不可見', async () => {
    await withRollback(pool, async (tx) => {
      const a = await seedTenant(tx);
      const b = await seedTenant(tx);

      // 以 A 的 companyId 讀 B 的 team / product / mgmt / issueSet，全落空。
      expect(await containerRepo.getTeam(a.companyId, b.teamId, tx)).toBeUndefined();
      expect(await containerRepo.getProduct(a.companyId, b.productId, tx)).toBeUndefined();
      expect(await containerRepo.getMgmt(a.companyId, b.mgmtId, tx)).toBeUndefined();
      expect(await containerRepo.getIssueSet(a.companyId, b.issueSetId, tx)).toBeUndefined();

      // 列表只含自己租戶的資料。
      const aTeams = await containerRepo.listTeamsByCompany(a.companyId, tx);
      expect(aTeams.map((t) => t.id)).toEqual([a.teamId]);

      // 跨租戶改名 / 刪除無效。
      expect(await containerRepo.renameTeam(a.companyId, b.teamId, 'hacked', tx)).toBeUndefined();
      expect(await containerRepo.deleteMgmt(a.companyId, b.mgmtId, tx)).toBe(false);
      expect(await containerRepo.getMgmt(b.companyId, b.mgmtId, tx)).toBeDefined();
    });
  });

  // ---------- 流水號取號 ----------

  it('takeNextSeq：序列前進、跨租戶不可取號', async () => {
    await withRollback(pool, async (tx) => {
      const f = await seedTenant(tx);
      expect(await containerRepo.takeNextSeq(f.companyId, f.issueSetId, tx)).toBe(1);
      expect(await containerRepo.takeNextSeq(f.companyId, f.issueSetId, tx)).toBe(2);
      expect(await containerRepo.takeNextSeq(f.companyId, f.issueSetId, tx)).toBe(3);

      const set = await containerRepo.getIssueSet(f.companyId, f.issueSetId, tx);
      expect(set?.nextSeq).toBe(4);

      // 錯 Company 取不到號。
      expect(await containerRepo.takeNextSeq(randomUUID(), f.issueSetId, tx)).toBeUndefined();
    });
  });

  it('takeNextSeq：併發取號不重號、不留空號', async () => {
    // 需跨連線真正併發、真提交才驗得到列鎖序列化，故不走 rollback，收尾清理。
    const companyId = randomUUID();
    const teamId = randomUUID();
    const productId = randomUUID();
    const mgmtId = randomUUID();
    const issueSetId = randomUUID();
    const CONCURRENCY = 50;
    try {
      await withTransaction(async (tx) => {
        await containerRepo.createCompany({ id: companyId, name: 'RaceCo' }, tx);
        await containerRepo.createTeam({ id: teamId, companyId, name: 'T' }, tx);
        await containerRepo.createProduct({ id: productId, companyId, teamId, name: 'P' }, tx);
        await containerRepo.createMgmtWithInitialIssueSet(
          {
            mgmt: { id: mgmtId, companyId, productId, name: 'M' },
            issueSet: { id: issueSetId, companyId, name: 'S', key: 'RACE' },
          },
          tx,
        );
      }, pool);

      // 併發打連線池，每個 takeNextSeq 是自成一體的 UPDATE ... RETURNING。
      const seqs = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          containerRepo.takeNextSeq(companyId, issueSetId, pool),
        ),
      );

      const values = seqs.filter((s): s is number => s !== undefined);
      expect(values).toHaveLength(CONCURRENCY);
      // 不重號：去重後數量不變。
      expect(new Set(values).size).toBe(CONCURRENCY);
      // 不留空號：恰為 1..CONCURRENCY 的連續集合。
      expect([...values].sort((a, b) => a - b)).toEqual(
        Array.from({ length: CONCURRENCY }, (_, i) => i + 1),
      );

      const set = await containerRepo.getIssueSet(companyId, issueSetId, pool);
      expect(set?.nextSeq).toBe(CONCURRENCY + 1);
    } finally {
      // 單交易內反向刪除；mgmt<->issue_set 的環狀 FK 為 deferred，於 COMMIT 一次檢核。
      await withTransaction(async (tx) => {
        await tx.query('DELETE FROM issue_sets WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM mgmts WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM products WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM teams WHERE company_id = $1', [companyId]);
        await tx.query('DELETE FROM companies WHERE id = $1', [companyId]);
      }, pool);
    }
  });
});
