import type { Executor } from './executor.js';

// 權限 repository：Accounts、Roles、AccountRoles、RoleScopes、LevelDefinitions、
// TagGroups、TagValues、RateHistories、ViewShares 的讀寫，
// 以及 computeEffectivePermission 有效權限計算所需的組合查詢。
// domain 層無權限實體型別，故本層自帶儲存型別。
// 邊界：row 的 snake_case 轉 camelCase；bigint / numeric 由 pg 回字串，於此轉 Number；
// tags 為 jsonb，寫入前 stringify。租戶鍵 company_id 為每一筆查詢的必要條件。

// ============================================================
// domain 形狀
// ============================================================

export interface Account {
  id: string;
  companyId: string;
  name: string;
  defaultCalendarName: string | null;
  tags: Record<string, string> | null;
  createdOn: number;
  updatedOn: number;
}

export interface LevelDefinition {
  id: string;
  companyId: string;
  name: string;
  system: boolean;
  canRead: boolean;
  canComment: boolean;
  canCreate: boolean;
  canEditOwn: boolean;
  canEditAny: boolean;
  canArchive: boolean;
  canStructure: boolean;
  canAssignRole: boolean;
  createdOn: number;
  updatedOn: number;
}

export interface Role {
  id: string;
  companyId: string;
  roleTitle: string;
  levelId: string;
  typeAdmin: boolean;
  orgAdmin: boolean;
  permAdmin: boolean;
  tags: Record<string, string> | null;
  createdOn: number;
  updatedOn: number;
}

export interface AccountRole {
  id: string;
  companyId: string;
  accountId: string;
  roleId: string;
  createdOn: number;
  updatedOn: number;
}

/** 範圍種類；粒度下限為 Mgmt。 */
export type ScopeKind = 'company' | 'team' | 'product' | 'mgmt';

export interface RoleScope {
  id: string;
  companyId: string;
  roleId: string;
  scopeKind: ScopeKind;
  scopeId: string;
  createdOn: number;
  updatedOn: number;
}

export interface TagGroup {
  id: string;
  companyId: string;
  name: string;
  target: 'account' | 'role';
  system: boolean;
  createdOn: number;
  updatedOn: number;
}

export interface TagValue {
  id: string;
  companyId: string;
  tagGroupId: string;
  value: string;
  createdOn: number;
  updatedOn: number;
}

export interface RateHistory {
  id: string;
  companyId: string;
  tagValueId: string;
  effectiveOn: number;
  hourlyRate: number;
  createdOn: number;
  updatedOn: number;
}

export type ShareTargetKind = 'account' | 'team' | 'company';
export type ShareLevel = 'readonly' | 'editable' | 'owner';

export interface ViewShare {
  id: string;
  companyId: string;
  viewId: string;
  targetKind: ShareTargetKind;
  targetId: string;
  shareLevel: ShareLevel;
  createdOn: number;
  updatedOn: number;
}

/**
 * computeEffectivePermission 的一份輸入：一個 Role 及其等級與範圍清單。
 * 有效權限為帳號全部 Role bundle 的聯集，計算落 domain 層，本層只供料。
 */
export interface RolePermissionBundle {
  role: Role;
  level: LevelDefinition;
  scopes: RoleScope[];
}

// ============================================================
// row 形狀
// ============================================================

interface AccountRow {
  id: string;
  company_id: string;
  name: string;
  default_calendar_name: string | null;
  tags: Record<string, string> | null;
  created_on: string;
  updated_on: string;
}

interface LevelDefinitionRow {
  id: string;
  company_id: string;
  name: string;
  system: boolean;
  can_read: boolean;
  can_comment: boolean;
  can_create: boolean;
  can_edit_own: boolean;
  can_edit_any: boolean;
  can_archive: boolean;
  can_structure: boolean;
  can_assign_role: boolean;
  created_on: string;
  updated_on: string;
}

interface RoleRow {
  id: string;
  company_id: string;
  role_title: string;
  level_id: string;
  type_admin: boolean;
  org_admin: boolean;
  perm_admin: boolean;
  tags: Record<string, string> | null;
  created_on: string;
  updated_on: string;
}

interface AccountRoleRow {
  id: string;
  company_id: string;
  account_id: string;
  role_id: string;
  created_on: string;
  updated_on: string;
}

interface RoleScopeRow {
  id: string;
  company_id: string;
  role_id: string;
  scope_kind: ScopeKind;
  scope_id: string;
  created_on: string;
  updated_on: string;
}

interface TagGroupRow {
  id: string;
  company_id: string;
  name: string;
  target: 'account' | 'role';
  system: boolean;
  created_on: string;
  updated_on: string;
}

interface TagValueRow {
  id: string;
  company_id: string;
  tag_group_id: string;
  value: string;
  created_on: string;
  updated_on: string;
}

interface RateHistoryRow {
  id: string;
  company_id: string;
  tag_value_id: string;
  effective_on: string;
  hourly_rate: string;
  created_on: string;
  updated_on: string;
}

interface ViewShareRow {
  id: string;
  company_id: string;
  view_id: string;
  target_kind: ShareTargetKind;
  target_id: string;
  share_level: ShareLevel;
  created_on: string;
  updated_on: string;
}

// ============================================================
// Accounts
// ============================================================

export async function insertAccount(exec: Executor, account: Account): Promise<void> {
  await exec.query(
    `INSERT INTO accounts
       (id, company_id, name, default_calendar_name, tags, created_on, updated_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      account.id,
      account.companyId,
      account.name,
      account.defaultCalendarName,
      account.tags === null ? null : JSON.stringify(account.tags),
      account.createdOn,
      account.updatedOn,
    ],
  );
}

export async function getAccount(
  exec: Executor,
  companyId: string,
  id: string,
): Promise<Account | undefined> {
  const result = await exec.query<AccountRow>(
    `SELECT id, company_id, name, default_calendar_name, tags, created_on, updated_on
     FROM accounts WHERE company_id = $1 AND id = $2`,
    [companyId, id],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : rowToAccount(row);
}

export async function listAccounts(exec: Executor, companyId: string): Promise<Account[]> {
  const result = await exec.query<AccountRow>(
    `SELECT id, company_id, name, default_calendar_name, tags, created_on, updated_on
     FROM accounts WHERE company_id = $1 ORDER BY name`,
    [companyId],
  );
  return result.rows.map(rowToAccount);
}

// ============================================================
// LevelDefinitions
// ============================================================

export async function insertLevelDefinition(
  exec: Executor,
  level: LevelDefinition,
): Promise<void> {
  await exec.query(
    `INSERT INTO level_definitions
       (id, company_id, name, system, can_read, can_comment, can_create,
        can_edit_own, can_edit_any, can_archive, can_structure, can_assign_role,
        created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      level.id,
      level.companyId,
      level.name,
      level.system,
      level.canRead,
      level.canComment,
      level.canCreate,
      level.canEditOwn,
      level.canEditAny,
      level.canArchive,
      level.canStructure,
      level.canAssignRole,
      level.createdOn,
      level.updatedOn,
    ],
  );
}

export async function getLevelDefinition(
  exec: Executor,
  companyId: string,
  id: string,
): Promise<LevelDefinition | undefined> {
  const result = await exec.query<LevelDefinitionRow>(
    `${LEVEL_SELECT} WHERE company_id = $1 AND id = $2`,
    [companyId, id],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : rowToLevel(row);
}

export async function listLevelDefinitions(
  exec: Executor,
  companyId: string,
): Promise<LevelDefinition[]> {
  const result = await exec.query<LevelDefinitionRow>(
    `${LEVEL_SELECT} WHERE company_id = $1 ORDER BY name`,
    [companyId],
  );
  return result.rows.map(rowToLevel);
}

const LEVEL_SELECT = `SELECT id, company_id, name, system, can_read, can_comment, can_create,
  can_edit_own, can_edit_any, can_archive, can_structure, can_assign_role,
  created_on, updated_on FROM level_definitions`;

// ============================================================
// Roles
// ============================================================

export async function insertRole(exec: Executor, role: Role): Promise<void> {
  await exec.query(
    `INSERT INTO roles
       (id, company_id, role_title, level_id, type_admin, org_admin, perm_admin,
        tags, created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      role.id,
      role.companyId,
      role.roleTitle,
      role.levelId,
      role.typeAdmin,
      role.orgAdmin,
      role.permAdmin,
      role.tags === null ? null : JSON.stringify(role.tags),
      role.createdOn,
      role.updatedOn,
    ],
  );
}

export async function getRole(
  exec: Executor,
  companyId: string,
  id: string,
): Promise<Role | undefined> {
  const result = await exec.query<RoleRow>(`${ROLE_SELECT} WHERE company_id = $1 AND id = $2`, [
    companyId,
    id,
  ]);
  const row = result.rows[0];
  return row === undefined ? undefined : rowToRole(row);
}

export async function listRoles(exec: Executor, companyId: string): Promise<Role[]> {
  const result = await exec.query<RoleRow>(
    `${ROLE_SELECT} WHERE company_id = $1 ORDER BY role_title`,
    [companyId],
  );
  return result.rows.map(rowToRole);
}

const ROLE_SELECT = `SELECT id, company_id, role_title, level_id, type_admin, org_admin,
  perm_admin, tags, created_on, updated_on FROM roles`;

// ============================================================
// AccountRoles
// ============================================================

/** 分派 Role：新增一筆 AccountRoles 記錄。分派前的範圍與等級檢查由 domain 承載。 */
export async function insertAccountRole(exec: Executor, link: AccountRole): Promise<void> {
  await exec.query(
    `INSERT INTO account_roles (id, company_id, account_id, role_id, created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [link.id, link.companyId, link.accountId, link.roleId, link.createdOn, link.updatedOn],
  );
}

export async function deleteAccountRole(
  exec: Executor,
  companyId: string,
  id: string,
): Promise<void> {
  await exec.query(`DELETE FROM account_roles WHERE company_id = $1 AND id = $2`, [companyId, id]);
}

export async function listAccountRoles(
  exec: Executor,
  companyId: string,
  accountId: string,
): Promise<AccountRole[]> {
  const result = await exec.query<AccountRoleRow>(
    `SELECT id, company_id, account_id, role_id, created_on, updated_on
     FROM account_roles WHERE company_id = $1 AND account_id = $2`,
    [companyId, accountId],
  );
  return result.rows.map(rowToAccountRole);
}

// ============================================================
// RoleScopes
// ============================================================

export async function insertRoleScope(exec: Executor, scope: RoleScope): Promise<void> {
  await exec.query(
    `INSERT INTO role_scopes
       (id, company_id, role_id, scope_kind, scope_id, created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      scope.id,
      scope.companyId,
      scope.roleId,
      scope.scopeKind,
      scope.scopeId,
      scope.createdOn,
      scope.updatedOn,
    ],
  );
}

export async function listRoleScopes(
  exec: Executor,
  companyId: string,
  roleId: string,
): Promise<RoleScope[]> {
  const result = await exec.query<RoleScopeRow>(
    `SELECT id, company_id, role_id, scope_kind, scope_id, created_on, updated_on
     FROM role_scopes WHERE company_id = $1 AND role_id = $2`,
    [companyId, roleId],
  );
  return result.rows.map(rowToRoleScope);
}

// ============================================================
// TagGroups / TagValues
// ============================================================

export async function insertTagGroup(exec: Executor, group: TagGroup): Promise<void> {
  await exec.query(
    `INSERT INTO tag_groups (id, company_id, name, target, system, created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      group.id,
      group.companyId,
      group.name,
      group.target,
      group.system,
      group.createdOn,
      group.updatedOn,
    ],
  );
}

export async function listTagGroups(exec: Executor, companyId: string): Promise<TagGroup[]> {
  const result = await exec.query<TagGroupRow>(
    `SELECT id, company_id, name, target, system, created_on, updated_on
     FROM tag_groups WHERE company_id = $1 ORDER BY name`,
    [companyId],
  );
  return result.rows.map(rowToTagGroup);
}

export async function insertTagValue(exec: Executor, value: TagValue): Promise<void> {
  await exec.query(
    `INSERT INTO tag_values (id, company_id, tag_group_id, value, created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      value.id,
      value.companyId,
      value.tagGroupId,
      value.value,
      value.createdOn,
      value.updatedOn,
    ],
  );
}

export async function listTagValues(
  exec: Executor,
  companyId: string,
  tagGroupId: string,
): Promise<TagValue[]> {
  const result = await exec.query<TagValueRow>(
    `SELECT id, company_id, tag_group_id, value, created_on, updated_on
     FROM tag_values WHERE company_id = $1 AND tag_group_id = $2 ORDER BY value`,
    [companyId, tagGroupId],
  );
  return result.rows.map(rowToTagValue);
}

// ============================================================
// RateHistories
// ============================================================

export async function insertRateHistory(exec: Executor, rate: RateHistory): Promise<void> {
  await exec.query(
    `INSERT INTO rate_histories
       (id, company_id, tag_value_id, effective_on, hourly_rate, created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      rate.id,
      rate.companyId,
      rate.tagValueId,
      rate.effectiveOn,
      rate.hourlyRate,
      rate.createdOn,
      rate.updatedOn,
    ],
  );
}

/** 一個職級標籤值的費率歷史，依生效日升冪。 */
export async function listRateHistories(
  exec: Executor,
  companyId: string,
  tagValueId: string,
): Promise<RateHistory[]> {
  const result = await exec.query<RateHistoryRow>(
    `SELECT id, company_id, tag_value_id, effective_on, hourly_rate, created_on, updated_on
     FROM rate_histories WHERE company_id = $1 AND tag_value_id = $2
     ORDER BY effective_on`,
    [companyId, tagValueId],
  );
  return result.rows.map(rowToRateHistory);
}

/** 某職級標籤值在指定時點的生效費率：取生效日不晚於該時點的最新一筆；無則 undefined。 */
export async function getRateAsOf(
  exec: Executor,
  companyId: string,
  tagValueId: string,
  asOf: number,
): Promise<RateHistory | undefined> {
  const result = await exec.query<RateHistoryRow>(
    `SELECT id, company_id, tag_value_id, effective_on, hourly_rate, created_on, updated_on
     FROM rate_histories
     WHERE company_id = $1 AND tag_value_id = $2 AND effective_on <= $3
     ORDER BY effective_on DESC LIMIT 1`,
    [companyId, tagValueId, asOf],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : rowToRateHistory(row);
}

// ============================================================
// ViewShares
// ============================================================

export async function insertViewShare(exec: Executor, share: ViewShare): Promise<void> {
  await exec.query(
    `INSERT INTO view_shares
       (id, company_id, view_id, target_kind, target_id, share_level, created_on, updated_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      share.id,
      share.companyId,
      share.viewId,
      share.targetKind,
      share.targetId,
      share.shareLevel,
      share.createdOn,
      share.updatedOn,
    ],
  );
}

export async function listViewSharesByView(
  exec: Executor,
  companyId: string,
  viewId: string,
): Promise<ViewShare[]> {
  const result = await exec.query<ViewShareRow>(
    `SELECT id, company_id, view_id, target_kind, target_id, share_level, created_on, updated_on
     FROM view_shares WHERE company_id = $1 AND view_id = $2`,
    [companyId, viewId],
  );
  return result.rows.map(rowToViewShare);
}

// ============================================================
// 有效權限計算所需的組合查詢
// ============================================================

/**
 * 取一個帳號有效權限計算所需的全部素材：其掛載的每個 Role，各帶等級與範圍清單。
 * computeEffectivePermission 對這批 bundle 取聯集與取高，計算落 domain 層。
 * 範圍展開（整層項目涵蓋子層）為讀取時計算，本層只回原始範圍清單、不預先展開。
 */
export async function getEffectivePermissionInputs(
  exec: Executor,
  companyId: string,
  accountId: string,
): Promise<RolePermissionBundle[]> {
  const roleResult = await exec.query<RoleRow>(
    `SELECT r.id, r.company_id, r.role_title, r.level_id, r.type_admin, r.org_admin,
            r.perm_admin, r.tags, r.created_on, r.updated_on
     FROM roles r
       JOIN account_roles ar ON ar.role_id = r.id AND ar.company_id = r.company_id
     WHERE r.company_id = $1 AND ar.account_id = $2`,
    [companyId, accountId],
  );
  const roles = roleResult.rows.map(rowToRole);
  if (roles.length === 0) return [];

  const bundles: RolePermissionBundle[] = [];
  for (const role of roles) {
    const level = await getLevelDefinition(exec, companyId, role.levelId);
    /* v8 ignore next 3 -- levelId 有 FK 約束，取不到代表資料已壞 */
    if (level === undefined) {
      throw new Error(`Role ${role.id} 的等級定義 ${role.levelId} 不存在`);
    }
    const scopes = await listRoleScopes(exec, companyId, role.id);
    bundles.push({ role, level, scopes });
  }
  return bundles;
}

// ============================================================
// row -> domain 轉換
// ============================================================

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    defaultCalendarName: row.default_calendar_name,
    tags: row.tags,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToLevel(row: LevelDefinitionRow): LevelDefinition {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    system: row.system,
    canRead: row.can_read,
    canComment: row.can_comment,
    canCreate: row.can_create,
    canEditOwn: row.can_edit_own,
    canEditAny: row.can_edit_any,
    canArchive: row.can_archive,
    canStructure: row.can_structure,
    canAssignRole: row.can_assign_role,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    companyId: row.company_id,
    roleTitle: row.role_title,
    levelId: row.level_id,
    typeAdmin: row.type_admin,
    orgAdmin: row.org_admin,
    permAdmin: row.perm_admin,
    tags: row.tags,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToAccountRole(row: AccountRoleRow): AccountRole {
  return {
    id: row.id,
    companyId: row.company_id,
    accountId: row.account_id,
    roleId: row.role_id,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToRoleScope(row: RoleScopeRow): RoleScope {
  return {
    id: row.id,
    companyId: row.company_id,
    roleId: row.role_id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToTagGroup(row: TagGroupRow): TagGroup {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    target: row.target,
    system: row.system,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToTagValue(row: TagValueRow): TagValue {
  return {
    id: row.id,
    companyId: row.company_id,
    tagGroupId: row.tag_group_id,
    value: row.value,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToRateHistory(row: RateHistoryRow): RateHistory {
  return {
    id: row.id,
    companyId: row.company_id,
    tagValueId: row.tag_value_id,
    effectiveOn: Number(row.effective_on),
    hourlyRate: Number(row.hourly_rate),
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function rowToViewShare(row: ViewShareRow): ViewShare {
  return {
    id: row.id,
    companyId: row.company_id,
    viewId: row.view_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    shareLevel: row.share_level,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}
