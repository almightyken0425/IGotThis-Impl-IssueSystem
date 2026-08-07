import type { Pool } from 'pg';

import { withTransaction } from '../db/client.js';
import type { AuthConfig } from './config.js';
import {
  deleteSession,
  findAccountByEmail,
  findDefaultCompany,
  findPublicAccountById,
  getSession,
  insertAccountWithCredentials,
  insertCompany,
  insertSession,
  type SessionRecord,
} from './authRepo.js';
import { hashPassword, verifyPassword } from './password.js';
import { isExpired, newSessionId, sessionExpiry } from './session.js';

// 認證流程編排：註冊、登入、登出、session 解析。
//
// 座落於路由與 repository / password / session 之間，是認證的核心邏輯落點。
// IO 副作用（時鐘、亂數 id）由 deps 注入，測試可餵定值、線上用真實作。
// 路由層只做協定轉換：收 body、呼叫本層、把結果碼轉成 HTTP。

/** cookie 只需 session id；對路由暴露最小面。 */
export type SessionCookieCarrier = Pick<SessionRecord, 'id'>;

/** 對外投影的帳號，永不含 password_hash。 */
export interface PublicAccount {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly email: string;
}

/** 注入點：時鐘與識別碼產生器，預設為真實作。 */
export interface AuthDeps {
  readonly now: () => number;
  readonly newId: () => string;
  readonly newSessionId: () => string;
}

export const defaultAuthDeps: AuthDeps = {
  now: () => Date.now(),
  newId: () => randomId(),
  newSessionId,
};

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthSuccess {
  readonly ok: true;
  readonly account: PublicAccount;
  readonly session: SessionRecord;
}

export type RegisterResult = AuthSuccess | { readonly ok: false; readonly code: 'EMAIL_TAKEN' };
export type LoginResult = AuthSuccess | { readonly ok: false; readonly code: 'INVALID_CREDENTIALS' };

/** 預設 Company 名稱：單一 Company 模式下首帳號註冊時植入。 */
const DEFAULT_COMPANY_NAME = 'Default Company';

/** PostgreSQL 唯一約束違反的 SQLSTATE。 */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * 註冊：雜湊密碼、決定 Company 歸屬、建帳號、發 session，全程單一交易。
 *
 * Company 歸屬（單一 Company 模式）：已有 Company 則綁現存預設租戶；
 * 空庫則植入一個預設 Company 再綁。email 重複回 EMAIL_TAKEN。
 */
export async function registerAccount(
  pool: Pool,
  config: AuthConfig,
  deps: AuthDeps,
  input: RegisterInput,
): Promise<RegisterResult> {
  const passwordHash = await hashPassword(input.password);
  const now = deps.now();

  try {
    return await withTransaction<RegisterResult>(async (tx) => {
      const existing = await findAccountByEmail(tx, input.email);
      if (existing !== undefined) {
        return { ok: false, code: 'EMAIL_TAKEN' };
      }

      let companyId = await findDefaultCompany(tx);
      if (companyId === undefined) {
        companyId = deps.newId();
        await insertCompany(tx, companyId, DEFAULT_COMPANY_NAME);
      }

      const accountId = deps.newId();
      await insertAccountWithCredentials(tx, {
        id: accountId,
        companyId,
        name: input.name,
        email: input.email,
        passwordHash,
        createdOn: now,
        updatedOn: now,
      });

      const session = await issueSession(tx, config, deps, companyId, accountId, now);
      return {
        ok: true,
        account: { id: accountId, companyId, name: input.name, email: input.email },
        session,
      };
    }, pool);
  } catch (error: unknown) {
    // 並發下唯一索引兜底：check-then-insert 之間的競態由此收斂為 EMAIL_TAKEN。
    if (isUniqueViolation(error)) {
      return { ok: false, code: 'EMAIL_TAKEN' };
    }
    throw error;
  }
}

/**
 * 登入：查 email、驗密碼、發 session。
 * 帳號不存在與密碼錯誤回相同碼 INVALID_CREDENTIALS，不對外洩漏 email 是否存在。
 */
export async function authenticate(
  pool: Pool,
  config: AuthConfig,
  deps: AuthDeps,
  input: LoginInput,
): Promise<LoginResult> {
  const credential = await findAccountByEmail(pool, input.email);
  if (credential === undefined) {
    // 帳號不存在也走一次真實雜湊驗證，時間側通道不洩漏 email 是否存在。
    await verifyPassword(await getDummyHash(), input.password);
    return { ok: false, code: 'INVALID_CREDENTIALS' };
  }

  const passwordOk = await verifyPassword(credential.passwordHash, input.password);
  if (!passwordOk) {
    return { ok: false, code: 'INVALID_CREDENTIALS' };
  }

  const now = deps.now();
  const session = await issueSession(
    pool,
    config,
    deps,
    credential.companyId,
    credential.id,
    now,
  );
  return {
    ok: true,
    account: {
      id: credential.id,
      companyId: credential.companyId,
      name: credential.name,
      email: credential.email,
    },
    session,
  };
}

/** 登出：刪 session 列，該 session 即刻失效。查無為無操作。 */
export async function logout(pool: Pool, sessionId: string): Promise<void> {
  await deleteSession(pool, sessionId);
}

/** 解析出的當前身分：下游路由以此帶租戶鍵查詢。 */
export interface ResolvedIdentity {
  readonly accountId: string;
  readonly companyId: string;
}

/**
 * 由 session id 解出當前身分；無效或逾期回 undefined。
 * 逾期的 session 順手刪除，避免殘列累積。
 */
export async function resolveSession(
  pool: Pool,
  sessionId: string,
  nowMs: number,
): Promise<ResolvedIdentity | undefined> {
  const session = await getSession(pool, sessionId);
  if (session === undefined) return undefined;
  if (isExpired(session.expiresOn, nowMs)) {
    await deleteSession(pool, session.id);
    return undefined;
  }
  return { accountId: session.accountId, companyId: session.companyId };
}

/** 取當前帳號的對外投影，供 /me 回傳；查無回 undefined（帳號已被刪等罕見情形）。 */
export async function getPublicAccount(
  pool: Pool,
  companyId: string,
  accountId: string,
): Promise<PublicAccount | undefined> {
  const row = await findPublicAccountById(pool, companyId, accountId);
  if (row === undefined) return undefined;
  return { id: row.id, companyId: row.company_id, name: row.name, email: row.email };
}

// ============================================================
// 內部
// ============================================================

/** 發一個 session 並落庫。 */
async function issueSession(
  exec: Parameters<typeof insertSession>[0],
  config: AuthConfig,
  deps: AuthDeps,
  companyId: string,
  accountId: string,
  now: number,
): Promise<SessionRecord> {
  const session: SessionRecord = {
    id: deps.newSessionId(),
    companyId,
    accountId,
    createdOn: now,
    expiresOn: sessionExpiry(now, config.ttlSeconds),
  };
  await insertSession(exec, session);
  return session;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * 帳號不存在時仍執行一次的假雜湊，供時間側通道打平。
 * 首次呼叫時算一個真 argon2id 雜湊並記憶，確保驗證耗時與真實路徑相當、且驗證恆不通過。
 */
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('*account-absent-placeholder*');
  return dummyHashPromise;
}
