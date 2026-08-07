import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

// 整合測試共用夾具。
// 非 *.test.ts，vitest 不收為測試檔，只供測試 import。
// 每個 case 在 withRollback 的交易內跑，跑完 ROLLBACK，測試間互不汙染。
// 交易 rollback 隔離工具集中於 db/testDb.ts，本檔自該處再匯出以維持既有 import 相容。
// 容器骨架的環狀 FK 為 deferrable，同交易內先插 mgmt 再插 issue_set 成立。

export { withRollback } from '../testDb.js';

export function newId(): string {
  return randomUUID();
}

/** 建一個 Company，回傳其 id。 */
export async function seedCompany(client: PoolClient, name = 'Co'): Promise<string> {
  const id = newId();
  await client.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [id, name]);
  return id;
}

export interface Container {
  teamId: string;
  productId: string;
  mgmtId: string;
  issueSetId: string;
}

/** 建 team / product / mgmt / issue_set 一整條容器骨架，回傳各 id。 */
export async function seedContainer(client: PoolClient, companyId: string): Promise<Container> {
  const teamId = newId();
  const productId = newId();
  const mgmtId = newId();
  const issueSetId = newId();

  await client.query('INSERT INTO teams (id, company_id, name) VALUES ($1, $2, $3)', [
    teamId,
    companyId,
    'T',
  ]);
  await client.query(
    'INSERT INTO products (id, company_id, team_id, name) VALUES ($1, $2, $3, $4)',
    [productId, companyId, teamId, 'P'],
  );
  await client.query(
    'INSERT INTO mgmts (id, company_id, product_id, name, container_issue_set_id) VALUES ($1, $2, $3, $4, $5)',
    [mgmtId, companyId, productId, 'M', issueSetId],
  );
  await client.query(
    'INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1, $2, $3, $4, $5)',
    [issueSetId, companyId, mgmtId, 'S', `K${issueSetId.slice(0, 4)}`],
  );

  return { teamId, productId, mgmtId, issueSetId };
}

/** 建一個工單型別定義，回傳其 id。 */
export async function seedIssueType(client: PoolClient, companyId: string): Promise<string> {
  const id = newId();
  await client.query(
    'INSERT INTO issue_type_definitions (id, company_id, name, label, field_sets, system) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, companyId, `type-${id.slice(0, 4)}`, 'Task', JSON.stringify(['基本']), false],
  );
  return id;
}

/** 建一張工單，回傳其 id。 */
export async function seedIssue(
  client: PoolClient,
  companyId: string,
  issueSetId: string,
  issueTypeId: string,
  issueKey: string,
): Promise<string> {
  const id = newId();
  await client.query(
    'INSERT INTO issues (id, company_id, issue_set_id, issue_type_id, issue_key) VALUES ($1,$2,$3,$4,$5)',
    [id, companyId, issueSetId, issueTypeId, issueKey],
  );
  return id;
}
