import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthConfig } from '../../auth/config.js';
import { loadEnv } from '../../db/env.js';
import { applyMigrations } from '../../db/migrate.js';
import { createServer } from '../index.js';

// 帳號路由整合測試：以 Fastify inject 打真實路由，連 igotthis_test。
// 隔離：每個 case 前 TRUNCATE companies CASCADE。
// 對比 calendars.test.ts：預設日曆屬個人偏好，一般成員（無 typeAdmin）即可設定。

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];
const suite = testUrl ? describe : describe.skip;

const TEST_CONFIG: AuthConfig = {
  sessionSecret: 'test-session-secret-please-change-0123456789',
  cookieName: 'igotthis_sid',
  ttlSeconds: 3600,
  cookieSecure: false,
};

suite('account routes', () => {
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

  async function register(email: string, name: string): Promise<{ cookie: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'password123', name },
    });
    const c = res.cookies.find((x) => x.name === TEST_CONFIG.cookieName);
    return { cookie: c ? `${c.name}=${c.value}` : '' };
  }

  it('未登入存取 GET /me 回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/accounts/me' });
    expect(res.statusCode).toBe(401);
  });

  it('未登入存取 PATCH /me 回 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/accounts/me',
      payload: { defaultCalendarName: '台灣' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('剛註冊帳號 GET /me 預設日曆為 null', async () => {
    const member = await register('m@example.com', 'M');
    const res = await app.inject({
      method: 'GET',
      url: '/api/accounts/me',
      headers: { cookie: member.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultCalendarName).toBeNull();
  });

  it('一般成員（無 typeAdmin）可設定自己的預設日曆，PATCH 與後續 GET 都反映新值', async () => {
    const member = await register('m@example.com', 'M');

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/accounts/me',
      headers: { cookie: member.cookie },
      payload: { defaultCalendarName: '台灣' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().defaultCalendarName).toBe('台灣');

    const get = await app.inject({
      method: 'GET',
      url: '/api/accounts/me',
      headers: { cookie: member.cookie },
    });
    expect(get.json().defaultCalendarName).toBe('台灣');
  });

  it('可設回 null 清除預設日曆', async () => {
    const member = await register('m@example.com', 'M');
    await app.inject({
      method: 'PATCH',
      url: '/api/accounts/me',
      headers: { cookie: member.cookie },
      payload: { defaultCalendarName: '台灣' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/accounts/me',
      headers: { cookie: member.cookie },
      payload: { defaultCalendarName: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultCalendarName).toBeNull();
  });

  it('缺 defaultCalendarName 回 400 INVALID_INPUT', async () => {
    const member = await register('m@example.com', 'M');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/accounts/me',
      headers: { cookie: member.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
