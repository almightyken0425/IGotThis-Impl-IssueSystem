import type { Executor } from '../db/repositories/executor.js';

// 認證專用 repository：登入憑證、單一 Company 引導、伺服器端 session 的讀寫。
//
// 為何自成一檔而非併入 permissionRepo：
// - email 與 password_hash 是認證層的技術延伸，permissionRepo 的 Account 型別
//   刻意不含憑證欄，兩者關注點不同
// - session 為認證層獨有實體，權限層不涉及
//
// 邊界（同 permissionRepo 慣例）：
// - row 的 snake_case 轉 camelCase；bigint 由 driver 回字串，於此轉 Number
// - 除 email 全域查詢（登入時尚不知租戶）外，一律帶 company_id 租戶鍵
// - 明文密碼永不進入本層，只收已雜湊字串

// ============================================================
// domain 形狀
// ============================================================

/** 帶登入憑證的帳號投影；password_hash 僅供驗證，不外流出認證層。 */
export interface AccountCredential {
  id: string;
  companyId: string;
  name: string;
  email: string;
  passwordHash: string;
}

export interface NewAccount {
  id: string;
  companyId: string;
  name: string;
  email: string;
  passwordHash: string;
  createdOn: number;
  updatedOn: number;
}

export interface SessionRecord {
  id: string;
  companyId: string;
  accountId: string;
  createdOn: number;
  expiresOn: number;
}

// ============================================================
// row 形狀
// ============================================================

interface AccountCredentialRow {
  id: string;
  company_id: string;
  name: string;
  email: string;
  password_hash: string;
}

/** 帳號對外投影列（不含憑證）。 */
export interface PublicAccountRow {
  id: string;
  company_id: string;
  name: string;
  email: string;
}

interface CompanyIdRow {
  id: string;
}

interface SessionRow {
  id: string;
  company_id: string;
  account_id: string;
  created_on: string;
  expires_on: string;
}

// ============================================================
// 單一 Company 引導
// ============================================================

/** 取現存任一 Company 的 id（依 name 決定序）；空庫回 undefined。 */
export async function findDefaultCompany(exec: Executor): Promise<string | undefined> {
  const result = await exec.query<CompanyIdRow>(
    'SELECT id FROM companies ORDER BY name LIMIT 1',
  );
  return result.rows[0]?.id;
}

/** 建一個 Company。首帳號註冊時，無現存 Company 則以此植入預設租戶。 */
export async function insertCompany(exec: Executor, id: string, name: string): Promise<void> {
  await exec.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [id, name]);
}

// ============================================================
// 帳號憑證
// ============================================================

/** 依 email 全域查帳號憑證；登入時尚不知租戶，故不帶 company_id。查無回 undefined。 */
export async function findAccountByEmail(
  exec: Executor,
  email: string,
): Promise<AccountCredential | undefined> {
  const result = await exec.query<AccountCredentialRow>(
    `SELECT id, company_id, name, email, password_hash
     FROM accounts WHERE email = $1`,
    [email],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : rowToCredential(row);
}

/** 依租戶鍵與 id 取帳號的對外投影（不含憑證）；供 /me 回傳。查無回 undefined。 */
export async function findPublicAccountById(
  exec: Executor,
  companyId: string,
  id: string,
): Promise<PublicAccountRow | undefined> {
  const result = await exec.query<PublicAccountRow>(
    `SELECT id, company_id, name, email
     FROM accounts WHERE company_id = $1 AND id = $2`,
    [companyId, id],
  );
  return result.rows[0];
}

/** 建帶憑證的帳號。email 唯一約束衝突由呼叫端接住轉 409。 */
export async function insertAccountWithCredentials(
  exec: Executor,
  account: NewAccount,
): Promise<void> {
  await exec.query(
    `INSERT INTO accounts
       (id, company_id, name, email, password_hash,
        default_calendar_name, tags, created_on, updated_on)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, $7)`,
    [
      account.id,
      account.companyId,
      account.name,
      account.email,
      account.passwordHash,
      account.createdOn,
      account.updatedOn,
    ],
  );
}

// ============================================================
// Session
// ============================================================

export async function insertSession(exec: Executor, session: SessionRecord): Promise<void> {
  await exec.query(
    `INSERT INTO sessions (id, company_id, account_id, created_on, expires_on)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.id, session.companyId, session.accountId, session.createdOn, session.expiresOn],
  );
}

/** 取 session；查無回 undefined。逾期判定由呼叫端以注入時鐘處理。 */
export async function getSession(
  exec: Executor,
  id: string,
): Promise<SessionRecord | undefined> {
  const result = await exec.query<SessionRow>(
    `SELECT id, company_id, account_id, created_on, expires_on
     FROM sessions WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : rowToSession(row);
}

/** 刪 session；logout 與清逾期共用。查無為無操作。 */
export async function deleteSession(exec: Executor, id: string): Promise<void> {
  await exec.query('DELETE FROM sessions WHERE id = $1', [id]);
}

// ============================================================
// row -> domain 轉換
// ============================================================

function rowToCredential(row: AccountCredentialRow): AccountCredential {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
  };
}

function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    accountId: row.account_id,
    createdOn: Number(row.created_on),
    expiresOn: Number(row.expires_on),
  };
}
