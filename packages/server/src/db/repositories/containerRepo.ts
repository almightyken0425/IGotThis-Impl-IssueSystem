import { getPool } from '../pool.js';
import type { Executor } from './executor.js';
import { run, runOne } from './executor.js';
import type {
  Company,
  CompanyTree,
  IssueSet,
  Mgmt,
  MgmtNode,
  Product,
  ProductNode,
  Team,
  TeamNode,
} from './types.js';

// 容器骨架 repository。
//
// 角色：Companies、Teams、Products、Mgmts、IssueSets 的 CRUD、樹狀查詢、
//       與工單集流水號的原子取號。
// 邊界：
// - 唯一碰容器骨架表的一層；SQL 不外流。
// - 讀出的 snake_case row 轉成 domain 的 camelCase 型別，寫入前反向轉。
// - 除 Companies 外每個讀寫都帶 companyId 租戶鍵，跨 Company 的資料互不可見。

// ============================================================
// row 型別與對映
// ============================================================

interface CompanyRow {
  id: string;
  name: string;
}
interface TeamRow {
  id: string;
  company_id: string;
  name: string;
}
interface ProductRow {
  id: string;
  company_id: string;
  team_id: string;
  name: string;
}
interface MgmtRow {
  id: string;
  company_id: string;
  product_id: string;
  name: string;
  container_issue_set_id: string;
}
interface IssueSetRow {
  id: string;
  company_id: string;
  mgmt_id: string;
  name: string;
  key: string;
  next_seq: number;
}

function toCompany(row: CompanyRow): Company {
  return { id: row.id, name: row.name };
}
function toTeam(row: TeamRow): Team {
  return { id: row.id, companyId: row.company_id, name: row.name };
}
function toProduct(row: ProductRow): Product {
  return { id: row.id, companyId: row.company_id, teamId: row.team_id, name: row.name };
}
function toMgmt(row: MgmtRow): Mgmt {
  return {
    id: row.id,
    companyId: row.company_id,
    productId: row.product_id,
    name: row.name,
    containerIssueSetId: row.container_issue_set_id,
  };
}
function toIssueSet(row: IssueSetRow): IssueSet {
  return {
    id: row.id,
    companyId: row.company_id,
    mgmtId: row.mgmt_id,
    name: row.name,
    key: row.key,
    nextSeq: row.next_seq,
  };
}

// ============================================================
// Companies
// ============================================================

export async function createCompany(
  input: Company,
  exec: Executor = getPool(),
): Promise<Company> {
  const row = await runOne<CompanyRow>(
    exec,
    'INSERT INTO companies (id, name) VALUES ($1, $2) RETURNING id, name',
    [input.id, input.name],
  );
  return toCompany(row!);
}

export async function getCompany(
  id: string,
  exec: Executor = getPool(),
): Promise<Company | undefined> {
  const row = await runOne<CompanyRow>(exec, 'SELECT id, name FROM companies WHERE id = $1', [id]);
  return row ? toCompany(row) : undefined;
}

export async function listCompanies(exec: Executor = getPool()): Promise<Company[]> {
  const rows = await run<CompanyRow>(exec, 'SELECT id, name FROM companies ORDER BY name');
  return rows.map(toCompany);
}

export async function renameCompany(
  id: string,
  name: string,
  exec: Executor = getPool(),
): Promise<Company | undefined> {
  const row = await runOne<CompanyRow>(
    exec,
    'UPDATE companies SET name = $2 WHERE id = $1 RETURNING id, name',
    [id, name],
  );
  return row ? toCompany(row) : undefined;
}

export async function deleteCompany(id: string, exec: Executor = getPool()): Promise<boolean> {
  const rows = await run<CompanyRow>(exec, 'DELETE FROM companies WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

// ============================================================
// Teams
// ============================================================

export async function createTeam(input: Team, exec: Executor = getPool()): Promise<Team> {
  const row = await runOne<TeamRow>(
    exec,
    'INSERT INTO teams (id, company_id, name) VALUES ($1, $2, $3) RETURNING id, company_id, name',
    [input.id, input.companyId, input.name],
  );
  return toTeam(row!);
}

export async function getTeam(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<Team | undefined> {
  const row = await runOne<TeamRow>(
    exec,
    'SELECT id, company_id, name FROM teams WHERE company_id = $1 AND id = $2',
    [companyId, id],
  );
  return row ? toTeam(row) : undefined;
}

export async function listTeamsByCompany(
  companyId: string,
  exec: Executor = getPool(),
): Promise<Team[]> {
  const rows = await run<TeamRow>(
    exec,
    'SELECT id, company_id, name FROM teams WHERE company_id = $1 ORDER BY name',
    [companyId],
  );
  return rows.map(toTeam);
}

export async function renameTeam(
  companyId: string,
  id: string,
  name: string,
  exec: Executor = getPool(),
): Promise<Team | undefined> {
  const row = await runOne<TeamRow>(
    exec,
    'UPDATE teams SET name = $3 WHERE company_id = $1 AND id = $2 RETURNING id, company_id, name',
    [companyId, id, name],
  );
  return row ? toTeam(row) : undefined;
}

export async function deleteTeam(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<boolean> {
  const rows = await run<TeamRow>(
    exec,
    'DELETE FROM teams WHERE company_id = $1 AND id = $2 RETURNING id',
    [companyId, id],
  );
  return rows.length > 0;
}

// ============================================================
// Products
// ============================================================

export async function createProduct(input: Product, exec: Executor = getPool()): Promise<Product> {
  const row = await runOne<ProductRow>(
    exec,
    `INSERT INTO products (id, company_id, team_id, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, company_id, team_id, name`,
    [input.id, input.companyId, input.teamId, input.name],
  );
  return toProduct(row!);
}

export async function getProduct(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<Product | undefined> {
  const row = await runOne<ProductRow>(
    exec,
    'SELECT id, company_id, team_id, name FROM products WHERE company_id = $1 AND id = $2',
    [companyId, id],
  );
  return row ? toProduct(row) : undefined;
}

export async function listProductsByTeam(
  companyId: string,
  teamId: string,
  exec: Executor = getPool(),
): Promise<Product[]> {
  const rows = await run<ProductRow>(
    exec,
    `SELECT id, company_id, team_id, name FROM products
     WHERE company_id = $1 AND team_id = $2 ORDER BY name`,
    [companyId, teamId],
  );
  return rows.map(toProduct);
}

export async function renameProduct(
  companyId: string,
  id: string,
  name: string,
  exec: Executor = getPool(),
): Promise<Product | undefined> {
  const row = await runOne<ProductRow>(
    exec,
    `UPDATE products SET name = $3 WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, team_id, name`,
    [companyId, id, name],
  );
  return row ? toProduct(row) : undefined;
}

export async function deleteProduct(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<boolean> {
  const rows = await run<ProductRow>(
    exec,
    'DELETE FROM products WHERE company_id = $1 AND id = $2 RETURNING id',
    [companyId, id],
  );
  return rows.length > 0;
}

// ============================================================
// Mgmts
// ============================================================

/**
 * 建立管理域。
 *
 * `containerIssueSetId` 對工單集有外鍵；該約束為 DEFERRABLE INITIALLY DEFERRED，
 * 於交易 COMMIT 時才檢核。單獨呼叫此方法（自動提交）而工單集尚未存在會失敗；
 * 主題單位置的初始工單集請走 `createMgmtWithInitialIssueSet`。
 */
export async function createMgmt(input: Mgmt, exec: Executor = getPool()): Promise<Mgmt> {
  const row = await runOne<MgmtRow>(
    exec,
    `INSERT INTO mgmts (id, company_id, product_id, name, container_issue_set_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, company_id, product_id, name, container_issue_set_id`,
    [input.id, input.companyId, input.productId, input.name, input.containerIssueSetId],
  );
  return toMgmt(row!);
}

export async function getMgmt(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<Mgmt | undefined> {
  const row = await runOne<MgmtRow>(
    exec,
    `SELECT id, company_id, product_id, name, container_issue_set_id
     FROM mgmts WHERE company_id = $1 AND id = $2`,
    [companyId, id],
  );
  return row ? toMgmt(row) : undefined;
}

export async function listMgmtsByProduct(
  companyId: string,
  productId: string,
  exec: Executor = getPool(),
): Promise<Mgmt[]> {
  const rows = await run<MgmtRow>(
    exec,
    `SELECT id, company_id, product_id, name, container_issue_set_id
     FROM mgmts WHERE company_id = $1 AND product_id = $2 ORDER BY name`,
    [companyId, productId],
  );
  return rows.map(toMgmt);
}

export async function renameMgmt(
  companyId: string,
  id: string,
  name: string,
  exec: Executor = getPool(),
): Promise<Mgmt | undefined> {
  const row = await runOne<MgmtRow>(
    exec,
    `UPDATE mgmts SET name = $3 WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, product_id, name, container_issue_set_id`,
    [companyId, id, name],
  );
  return row ? toMgmt(row) : undefined;
}

/** 更新主題單位置現任工單集。 */
export async function setContainerIssueSet(
  companyId: string,
  id: string,
  containerIssueSetId: string,
  exec: Executor = getPool(),
): Promise<Mgmt | undefined> {
  const row = await runOne<MgmtRow>(
    exec,
    `UPDATE mgmts SET container_issue_set_id = $3 WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, product_id, name, container_issue_set_id`,
    [companyId, id, containerIssueSetId],
  );
  return row ? toMgmt(row) : undefined;
}

export async function deleteMgmt(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<boolean> {
  const rows = await run<MgmtRow>(
    exec,
    'DELETE FROM mgmts WHERE company_id = $1 AND id = $2 RETURNING id',
    [companyId, id],
  );
  return rows.length > 0;
}

// ============================================================
// IssueSets
// ============================================================

/** 建立工單集；未指定 nextSeq 時由資料表預設起於 1。 */
export async function createIssueSet(
  input: Omit<IssueSet, 'nextSeq'> & { readonly nextSeq?: number },
  exec: Executor = getPool(),
): Promise<IssueSet> {
  const row = await runOne<IssueSetRow>(
    exec,
    `INSERT INTO issue_sets (id, company_id, mgmt_id, name, key, next_seq)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 1))
     RETURNING id, company_id, mgmt_id, name, key, next_seq`,
    [input.id, input.companyId, input.mgmtId, input.name, input.key, input.nextSeq ?? null],
  );
  return toIssueSet(row!);
}

export async function getIssueSet(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<IssueSet | undefined> {
  const row = await runOne<IssueSetRow>(
    exec,
    `SELECT id, company_id, mgmt_id, name, key, next_seq
     FROM issue_sets WHERE company_id = $1 AND id = $2`,
    [companyId, id],
  );
  return row ? toIssueSet(row) : undefined;
}

export async function listIssueSetsByMgmt(
  companyId: string,
  mgmtId: string,
  exec: Executor = getPool(),
): Promise<IssueSet[]> {
  const rows = await run<IssueSetRow>(
    exec,
    `SELECT id, company_id, mgmt_id, name, key, next_seq
     FROM issue_sets WHERE company_id = $1 AND mgmt_id = $2 ORDER BY name`,
    [companyId, mgmtId],
  );
  return rows.map(toIssueSet);
}

export async function renameIssueSet(
  companyId: string,
  id: string,
  name: string,
  exec: Executor = getPool(),
): Promise<IssueSet | undefined> {
  const row = await runOne<IssueSetRow>(
    exec,
    `UPDATE issue_sets SET name = $3 WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, mgmt_id, name, key, next_seq`,
    [companyId, id, name],
  );
  return row ? toIssueSet(row) : undefined;
}

export async function deleteIssueSet(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<boolean> {
  const rows = await run<IssueSetRow>(
    exec,
    'DELETE FROM issue_sets WHERE company_id = $1 AND id = $2 RETURNING id',
    [companyId, id],
  );
  return rows.length > 0;
}

/**
 * 建立管理域與其主題單位置初始工單集。
 *
 * 兩表互為外鍵（mgmt.container_issue_set_id -> issue_set、issue_set.mgmt_id -> mgmt），
 * 環狀關係靠 DEFERRABLE 約束於交易結束時才閉環，因此兩筆插入必須落在同一交易內。
 * 傳入的 `exec` 須為交易中的連線；正式路徑以 `withTransaction` 包一層。
 */
export async function createMgmtWithInitialIssueSet(
  input: {
    readonly mgmt: Omit<Mgmt, 'containerIssueSetId'>;
    readonly issueSet: Omit<IssueSet, 'mgmtId' | 'nextSeq'> & { readonly nextSeq?: number };
  },
  exec: Executor,
): Promise<{ mgmt: Mgmt; issueSet: IssueSet }> {
  const mgmt = await createMgmt(
    { ...input.mgmt, containerIssueSetId: input.issueSet.id },
    exec,
  );
  const issueSet = await createIssueSet({ ...input.issueSet, mgmtId: mgmt.id }, exec);
  return { mgmt, issueSet };
}

// ============================================================
// 流水號取號
// ============================================================

/**
 * 於工單集原子取號：遞增 next_seq 並回傳本次取得的號。
 *
 * 單一 UPDATE ... RETURNING 就地遞增，取回遞增前的值作為本次流水號。
 * 併發下 PostgreSQL 對同列 UPDATE 取列鎖、逐一序列化，兩個交易不會取到同號、
 * 亦不留空號；刪除的號不回收。工單集不存在（或跨 Company）時回 undefined。
 */
export async function takeNextSeq(
  companyId: string,
  issueSetId: string,
  exec: Executor = getPool(),
): Promise<number | undefined> {
  const row = await runOne<{ seq: number }>(
    exec,
    `UPDATE issue_sets SET next_seq = next_seq + 1
     WHERE company_id = $1 AND id = $2
     RETURNING next_seq - 1 AS seq`,
    [companyId, issueSetId],
  );
  return row?.seq;
}

// ============================================================
// 樹狀查詢
// ============================================================

/**
 * 取單一 Company 的容器骨架全樹：Company > Teams > Products > Mgmts > IssueSets。
 *
 * 各層以 company_id 一次撈齊、在記憶體內依歸屬外鍵組裝，只含該租戶的節點。
 * Company 不存在時回 undefined。
 */
export async function getContainerTree(
  companyId: string,
  exec: Executor = getPool(),
): Promise<CompanyTree | undefined> {
  const company = await getCompany(companyId, exec);
  if (!company) return undefined;

  // 逐一 await、不併發：exec 可能是單一交易連線，同連線上並行查詢不被 pg 支援。
  const teams = await listTeamsByCompanyRaw(companyId, exec);
  const products = await listProductsByCompanyRaw(companyId, exec);
  const mgmts = await listMgmtsByCompanyRaw(companyId, exec);
  const issueSets = await listIssueSetsByCompanyRaw(companyId, exec);

  const issueSetsByMgmt = groupBy(issueSets, (s) => s.mgmtId);
  const mgmtNodes: MgmtNode[] = mgmts.map((m) => ({
    ...m,
    issueSets: issueSetsByMgmt.get(m.id) ?? [],
  }));

  const mgmtsByProduct = groupBy(mgmtNodes, (m) => m.productId);
  const productNodes: ProductNode[] = products.map((p) => ({
    ...p,
    mgmts: mgmtsByProduct.get(p.id) ?? [],
  }));

  const productsByTeam = groupBy(productNodes, (p) => p.teamId);
  const teamNodes: TeamNode[] = teams.map((t) => ({
    ...t,
    products: productsByTeam.get(t.id) ?? [],
  }));

  return { ...company, teams: teamNodes };
}

async function listProductsByCompanyRaw(companyId: string, exec: Executor): Promise<Product[]> {
  const rows = await run<ProductRow>(
    exec,
    'SELECT id, company_id, team_id, name FROM products WHERE company_id = $1 ORDER BY name',
    [companyId],
  );
  return rows.map(toProduct);
}
async function listMgmtsByCompanyRaw(companyId: string, exec: Executor): Promise<Mgmt[]> {
  const rows = await run<MgmtRow>(
    exec,
    `SELECT id, company_id, product_id, name, container_issue_set_id
     FROM mgmts WHERE company_id = $1 ORDER BY name`,
    [companyId],
  );
  return rows.map(toMgmt);
}
async function listIssueSetsByCompanyRaw(companyId: string, exec: Executor): Promise<IssueSet[]> {
  const rows = await run<IssueSetRow>(
    exec,
    `SELECT id, company_id, mgmt_id, name, key, next_seq
     FROM issue_sets WHERE company_id = $1 ORDER BY name`,
    [companyId],
  );
  return rows.map(toIssueSet);
}
async function listTeamsByCompanyRaw(companyId: string, exec: Executor): Promise<Team[]> {
  return listTeamsByCompany(companyId, exec);
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
