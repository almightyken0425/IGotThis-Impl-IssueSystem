import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';

import { sendError } from '../api/errors.js';
import type { AuthConfig } from './config.js';
import { resolveSession, type ResolvedIdentity } from './service.js';

// 認證中介層：保護路由的 preHandler。
//
// 職責：從 cookie 取 session id、解出當前身分、掛到 request.auth 供下游取用。
// 無有效 session 一律回 401，且中止後續 handler。
// 邊界：只解析身分、不判權限；權限判定屬 domain 的有效權限計算，不在此。

// request.auth 由本中介層填入；未過中介層的請求為 undefined。
declare module 'fastify' {
  interface FastifyRequest {
    auth?: ResolvedIdentity;
  }
}

/**
 * 建一個 requireAuth preHandler，綁定連線池與認證設定。
 * 有效 session：填 request.auth 後放行。
 * 無 cookie / 簽章不符 / session 不存在或逾期：回 401 UNAUTHENTICATED。
 */
export function makeRequireAuth(pool: Pool, config: AuthConfig): preHandlerHookHandler {
  return async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const raw = request.cookies[config.cookieName];
    if (raw === undefined) {
      void sendError(reply, 401, 'UNAUTHENTICATED', '需要登入');
      return;
    }

    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || unsigned.value === null) {
      void sendError(reply, 401, 'UNAUTHENTICATED', '登入憑證無效');
      return;
    }

    const identity = await resolveSession(pool, unsigned.value, Date.now());
    if (identity === undefined) {
      void sendError(reply, 401, 'UNAUTHENTICATED', '登入已失效，請重新登入');
      return;
    }

    request.auth = identity;
  };
}

/**
 * 從 request 取當前身分；未經 requireAuth 的路徑呼叫視為程式錯誤。
 * 下游路由以此拿到租戶鍵 companyId，查詢一律帶此鍵。
 */
export function currentIdentity(request: FastifyRequest): ResolvedIdentity {
  /* v8 ignore next 3 -- 僅在忘記掛 requireAuth 時觸發，屬開發期程式錯誤 */
  if (request.auth === undefined) {
    throw new Error('currentIdentity 於未認證請求被呼叫；該路由缺 requireAuth preHandler');
  }
  return request.auth;
}
