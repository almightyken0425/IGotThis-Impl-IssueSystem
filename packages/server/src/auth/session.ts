import { randomBytes } from 'node:crypto';

// Session 機制的純函式部分：id 產生與逾期判定。
//
// 選型：cookie 只存不可猜的 session id，session 狀態全落伺服器端（sessions 表）。
// 相對 JWT 等自帶狀態的 token，伺服器端 session 可即時撤銷（logout 刪列即失效），
// 密碼變更、停用帳號都能立刻連動；代價是每次請求一次 DB 查詢，本系統可接受。
//
// 邊界：
// - 本檔不碰 IO 也不碰時鐘；「現在」由呼叫端注入，逾期為單純數值比較
// - id 為 256-bit 隨機、base64url 編碼，熵足以直接當不可猜的 bearer，無須再簽章

/** 產生一個高熵 session id（256-bit 隨機、base64url）。 */
export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

/** 依註冊時點與存活秒數算出逾期時點（皆為 Unix ms）。 */
export function sessionExpiry(nowMs: number, ttlSeconds: number): number {
  return nowMs + ttlSeconds * 1000;
}

/** 是否已逾期：現在時點不早於逾期時點即失效。 */
export function isExpired(expiresOnMs: number, nowMs: number): boolean {
  return nowMs >= expiresOnMs;
}
