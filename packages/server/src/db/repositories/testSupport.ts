import type { PoolClient } from 'pg';

import { randomUUID } from 'node:crypto';

// repository 整合測試的租戶 fixture 鷹架。
//
// - DB 連線 / schema 套用 / 交易 rollback 隔離的共用工具集中於 db/testDb.ts，
//   本檔自該處再匯出以維持既有 import 相容。
// - 建置 fixture 用 randomUUID 產獨立識別碼，同一 Company 租戶樹一次備齊。

export { hasTestDb, makeTestPool, withRollback } from '../testDb.js';

export interface Fixture {
  readonly companyId: string;
  readonly teamId: string;
  readonly productId: string;
  readonly mgmtId: string;
  readonly issueSetId: string;
  readonly issueTypeId: string;
  /** 已建好的可寫欄位名稱，供欄位值測試使用（field_defs 有外鍵）。 */
  readonly fieldName: string;
}

/**
 * 在給定連線內備妥一個 Company 租戶的完整骨架：
 * company > team > product > mgmt + 初始 issueSet，加一個工單型別與一個欄位定義。
 * 環狀 FK（mgmt <-> issue_set）靠 DEFERRABLE 約束在同交易內閉環。
 */
export async function seedTenant(
  client: PoolClient,
  overrides: { readonly companyId?: string } = {},
): Promise<Fixture> {
  const companyId = overrides.companyId ?? randomUUID();
  const teamId = randomUUID();
  const productId = randomUUID();
  const mgmtId = randomUUID();
  const issueSetId = randomUUID();
  const issueTypeId = randomUUID();
  const fieldSetName = '基本';
  const fieldName = 'Title';

  await client.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [companyId, 'FixtureCo']);
  await client.query('INSERT INTO teams (id, company_id, name) VALUES ($1, $2, $3)', [
    teamId,
    companyId,
    'FixtureTeam',
  ]);
  await client.query(
    'INSERT INTO products (id, company_id, team_id, name) VALUES ($1, $2, $3, $4)',
    [productId, companyId, teamId, 'FixtureProduct'],
  );
  // 環狀 FK：先插 mgmt（指向尚未存在的 issue_set），再插 issue_set，交易結束時閉環。
  await client.query(
    'INSERT INTO mgmts (id, company_id, product_id, name, container_issue_set_id) VALUES ($1,$2,$3,$4,$5)',
    [mgmtId, companyId, productId, 'FixtureMgmt', issueSetId],
  );
  await client.query(
    'INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1,$2,$3,$4,$5)',
    [issueSetId, companyId, mgmtId, 'FixtureSet', 'FIX'],
  );
  await client.query(
    'INSERT INTO issue_type_definitions (id, company_id, name, label, field_sets, system) VALUES ($1,$2,$3,$4,$5,$6)',
    [issueTypeId, companyId, 'task', 'Task', JSON.stringify([fieldSetName]), false],
  );
  await client.query(
    'INSERT INTO field_set_defs (company_id, name, system) VALUES ($1, $2, $3)',
    [companyId, fieldSetName, true],
  );
  await client.query(
    `INSERT INTO field_defs
       (company_id, name, field_set_name, kind, value_type, system, readonly, rollupable, rollup_fn, tracked, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [companyId, fieldName, fieldSetName, 'single', 'text', false, false, false, null, false, '標題'],
  );

  return { companyId, teamId, productId, mgmtId, issueSetId, issueTypeId, fieldName };
}

export { randomUUID };
