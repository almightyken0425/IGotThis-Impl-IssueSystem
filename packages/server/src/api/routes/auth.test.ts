import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthConfig } from '../../auth/config.js';
import { loadEnv } from '../../db/env.js';
import { applyMigrations } from '../../db/migrate.js';
import { createServer } from '../index.js';

// 認證路由整合測試：以 Fastify inject 打真實路由，連 igotthis_test。
//
// 隔離：每個 case 前 TRUNCATE companies CASCADE，連帶清空 accounts / sessions 等全租戶資料。
// 走真實連線池（非交易 rollback），因路由內部各自取連線、跨連線需真提交才互見。

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];
const suite = testUrl ? describe : describe.skip;

const TEST_CONFIG: AuthConfig = {
  sessionSecret: 'test-session-secret-please-change-0123456789',
  cookieName: 'igotthis_sid',
  ttlSeconds: 3600,
  cookieSecure: false,
};

interface AccountView {
  id: string;
  companyId: string;
  name: string;
  email: string;
}

suite('auth routes', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl });
    await applyMigrations(pool);
    app = createServer({ pool, authConfig: TEST_CONFIG });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE companies CASCADE');
  });

  // ---- helpers ----

  async function register(
    email: string,
    password: string,
    name: string,
  ): Promise<{
    status: number;
    body: { account?: AccountView; error?: { code: string } };
    cookie: string | undefined;
  }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password, name },
    });
    return { status: res.statusCode, body: res.json(), cookie: extractCookie(res.cookies) };
  }

  function extractCookie(
    cookies: readonly { name: string; value: string }[],
  ): string | undefined {
    const c = cookies.find((x) => x.name === TEST_CONFIG.cookieName);
    return c === undefined ? undefined : `${c.name}=${c.value}`;
  }

  // ---- register ----

  it('註冊成功回 201、帶帳號與 session cookie', async () => {
    const { status, body, cookie } = await register('alice@example.com', 'password123', 'Alice');
    expect(status).toBe(201);
    expect(body.account?.email).toBe('alice@example.com');
    expect(body.account?.name).toBe('Alice');
    expect(body.account?.id).toBeTruthy();
    expect(body.account?.companyId).toBeTruthy();
    expect(cookie).toBeDefined();
    // 回應不得洩漏任何密碼相關欄位。
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it('單一 Company 模式：後續帳號綁到同一預設 Company', async () => {
    const first = await register('a@example.com', 'password123', 'A');
    const second = await register('b@example.com', 'password123', 'B');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.account?.companyId).toBe(first.body.account?.companyId);
  });

  it('重複 email 註冊回 409 EMAIL_TAKEN', async () => {
    await register('dup@example.com', 'password123', 'First');
    const { status, body } = await register('dup@example.com', 'password123', 'Second');
    expect(status).toBe(409);
    expect(body.error?.code).toBe('EMAIL_TAKEN');
  });

  it('輸入不合法回 400 INVALID_INPUT', async () => {
    const badEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'password123', name: 'X' },
    });
    expect(badEmail.statusCode).toBe(400);
    expect(badEmail.json().error.code).toBe('INVALID_INPUT');

    const shortPw = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ok@example.com', password: 'short', name: 'X' },
    });
    expect(shortPw.statusCode).toBe(400);

    const missingName = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ok@example.com', password: 'password123' },
    });
    expect(missingName.statusCode).toBe(400);
  });

  // ---- login ----

  it('正確帳密登入回 200、帶 session cookie', async () => {
    await register('login@example.com', 'password123', 'Login');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().account.email).toBe('login@example.com');
    expect(extractCookie(res.cookies)).toBeDefined();
  });

  it('密碼錯誤回 401 INVALID_CREDENTIALS', async () => {
    await register('pw@example.com', 'password123', 'Pw');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'pw@example.com', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('不存在的 email 登入回 401 INVALID_CREDENTIALS（與密碼錯誤同碼）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@example.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  // ---- me ----

  it('帶有效 session 取 /me 回當前帳號', async () => {
    const { cookie } = await register('me@example.com', 'password123', 'Me');
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookie ?? '' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().account.email).toBe('me@example.com');
  });

  it('未帶 cookie 存取 /me 回 401 UNAUTHENTICATED', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('偽造 / 簽章不符的 cookie 存取 /me 回 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${TEST_CONFIG.cookieName}=forged-value` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('逾期 session 存取 /me 回 401，且逾期列被清除', async () => {
    const { cookie } = await register('exp@example.com', 'password123', 'Exp');
    await pool.query('UPDATE sessions SET expires_on = 0');
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookie ?? '' },
    });
    expect(res.statusCode).toBe(401);
    const remaining = await pool.query('SELECT count(*)::int AS n FROM sessions');
    expect(remaining.rows[0].n).toBe(0);
  });

  // ---- logout ----

  it('登出後舊 cookie 再取 /me 回 401', async () => {
    const { cookie } = await register('out@example.com', 'password123', 'Out');
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookie ?? '' },
    });
    expect(logoutRes.statusCode).toBe(200);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookie ?? '' },
    });
    expect(meRes.statusCode).toBe(401);
  });

  it('無 cookie 登出仍回 200（冪等）', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
