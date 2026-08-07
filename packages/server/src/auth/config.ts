// 認證層設定：session cookie 的密鑰、名稱、存活秒數。
//
// 唯一真相為根 .env（SESSION_SECRET / SESSION_COOKIE_NAME / SESSION_TTL_SECONDS）；
// 讀 process.env 集中在組裝根，其餘各層只收注入的設定物件、不直接碰 env。
// 測試以明值建構設定、繞過 env。

export interface AuthConfig {
  /** cookie 簽章密鑰；缺省即無法建構，避免匿名弱密鑰上線。 */
  readonly sessionSecret: string;
  /** session cookie 名稱。 */
  readonly cookieName: string;
  /** session 存活秒數。 */
  readonly ttlSeconds: number;
  /** cookie 是否標記 Secure；正式環境走 HTTPS 應為真，本機開發可為假。 */
  readonly cookieSecure: boolean;
}

/** 從環境變數解析認證設定；SESSION_SECRET 未設直接拋錯，不容匿名上線。 */
export function resolveAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const sessionSecret = env['SESSION_SECRET'];
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET 未設定，無法啟動認證層');
  }
  return {
    sessionSecret,
    cookieName: env['SESSION_COOKIE_NAME'] ?? 'igotthis_sid',
    ttlSeconds: Number(env['SESSION_TTL_SECONDS'] ?? 1_209_600),
    cookieSecure: env['NODE_ENV'] === 'production',
  };
}
