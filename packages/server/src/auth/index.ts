// 認證層匯出口。
//
// 角色：自帶帳密認證，涵蓋密碼雜湊、session 簽發與驗證、請求身分解析。
// 邊界：
// - 密碼只存雜湊，明文不落任何 log 與錯誤訊息
// - session 密鑰由環境變數注入，不寫死在程式碼
// - 授權判定屬 domain 的權限邏輯，本層只解析身分、不判權限
//
// 組成：
// - config：session cookie 設定，唯一真相為根 .env
// - password：argon2id 雜湊與驗證
// - session：session id 產生與逾期判定（純函式）
// - authRepo：憑證、單一 Company 引導、session 的資料存取
// - service：註冊 / 登入 / 登出 / session 解析的流程編排
// - middleware：保護路由的 requireAuth preHandler

export { resolveAuthConfig, type AuthConfig } from './config.js';
export { hashPassword, verifyPassword } from './password.js';
export { newSessionId, sessionExpiry, isExpired } from './session.js';
export {
  registerAccount,
  authenticate,
  logout,
  resolveSession,
  getPublicAccount,
  defaultAuthDeps,
  type AuthDeps,
  type PublicAccount,
  type ResolvedIdentity,
  type RegisterInput,
  type LoginInput,
  type RegisterResult,
  type LoginResult,
  type SessionCookieCarrier,
} from './service.js';
export { makeRequireAuth, currentIdentity } from './middleware.js';
