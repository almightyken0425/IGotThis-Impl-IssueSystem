import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from 'fastify';
import type { Pool } from 'pg';

import type { AuthConfig } from '../../auth/config.js';
import { currentIdentity } from '../../auth/middleware.js';
import {
  authenticate,
  getPublicAccount,
  logout,
  registerAccount,
  type AuthDeps,
  type LoginInput,
  type PublicAccount,
  type RegisterInput,
  type SessionCookieCarrier,
} from '../../auth/service.js';
import { sendError } from '../errors.js';

// 認證路由：/api/auth 之下的 register / login / logout / me。
//
// 本層只做協定轉換：schema 驗輸入、呼叫 auth service、把結果碼轉 HTTP、管 cookie。
// 業務邏輯（雜湊、Company 歸屬、session 簽發）全在 service，不在此。

export interface AuthRoutesOptions {
  readonly pool: Pool;
  readonly config: AuthConfig;
  readonly deps: AuthDeps;
  readonly requireAuth: preHandlerHookHandler;
}

// ---- 輸入 schema（Fastify 內建 ajv，無 format 外掛，故 email 以 pattern 驗）----

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

const registerBodySchema = {
  type: 'object',
  required: ['email', 'password', 'name'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 320 },
    password: { type: 'string', minLength: 8, maxLength: 200 },
    name: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', maxLength: 320 },
    password: { type: 'string', maxLength: 200 },
  },
} as const;

/** 把 PublicAccount 收斂為對外回傳形狀。 */
function accountView(account: PublicAccount): PublicAccount {
  return {
    id: account.id,
    companyId: account.companyId,
    name: account.name,
    email: account.email,
  };
}

/** 設定 session cookie：signed、httpOnly、sameSite lax，maxAge 對齊 TTL。 */
function setSessionCookie(
  reply: FastifyReply,
  config: AuthConfig,
  session: SessionCookieCarrier,
): void {
  reply.setCookie(config.cookieName, session.id, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.ttlSeconds,
  });
}

/** 清 session cookie。 */
function clearSessionCookie(reply: FastifyReply, config: AuthConfig): void {
  reply.clearCookie(config.cookieName, { path: '/' });
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, config, deps, requireAuth } = opts;

  // 註冊：建帳號 + 發 session。
  app.post<{ Body: RegisterInput }>(
    '/register',
    { schema: { body: registerBodySchema } },
    async (request, reply) => {
      const result = await registerAccount(pool, config, deps, request.body);
      if (!result.ok) {
        return sendError(reply, 409, result.code, '此 email 已被註冊');
      }
      setSessionCookie(reply, config, result.session);
      return reply.status(201).send({ account: accountView(result.account) });
    },
  );

  // 登入：驗密碼 + 發 session。
  app.post<{ Body: LoginInput }>(
    '/login',
    { schema: { body: loginBodySchema } },
    async (request, reply) => {
      const result = await authenticate(pool, config, deps, request.body);
      if (!result.ok) {
        return sendError(reply, 401, result.code, 'email 或密碼錯誤');
      }
      setSessionCookie(reply, config, result.session);
      return reply.status(200).send({ account: accountView(result.account) });
    },
  );

  // 登出：刪 session + 清 cookie。無 cookie 也視為成功（冪等）。
  app.post('/logout', async (request, reply) => {
    const raw = request.cookies[config.cookieName];
    if (raw !== undefined) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value !== null) {
        await logout(pool, unsigned.value);
      }
    }
    clearSessionCookie(reply, config);
    return reply.status(200).send({ ok: true });
  });

  // 當前帳號：需有效 session。
  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const identity = currentIdentity(request);
    const account = await getPublicAccount(pool, identity.companyId, identity.accountId);
    if (account === undefined) {
      return sendError(reply, 401, 'UNAUTHENTICATED', '帳號不存在');
    }
    return reply.status(200).send({ account: accountView(account) });
  });
};
