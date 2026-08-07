import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthConfig } from '../../auth/config.js';
import { loadEnv } from '../../db/env.js';
import { applyMigrations } from '../../db/migrate.js';
import {
  insertAccountRole,
  insertLevelDefinition,
  insertRole,
  type LevelDefinition,
  type Role,
} from '../../db/repositories/permissionRepo.js';
import { createServer } from '../index.js';

// 日曆路由整合測試：以 Fastify inject 打真實路由，連 igotthis_test。
// 隔離：每個 case 前 TRUNCATE companies CASCADE。
// 寫入需型別維護開關 typeAdmin，操作者的該開關以 repository 直插種下。

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];
const suite = testUrl ? describe : describe.skip;

const TEST_CONFIG: AuthConfig = {
  sessionSecret: 'test-session-secret-please-change-0123456789',
  cookieName: 'igotthis_sid',
  ttlSeconds: 3600,
  cookieSecure: false,
};

interface Registered {
  cookie: string;
  accountId: string;
  companyId: string;
}

suite('calendar routes', () => {
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

  async function register(email: string, name: string): Promise<Registered> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'password123', name },
    });
    const body = res.json() as { account: { id: string; companyId: string } };
    const c = res.cookies.find((x) => x.name === TEST_CONFIG.cookieName);
    return {
      cookie: c ? `${c.name}=${c.value}` : '',
      accountId: body.account.id,
      companyId: body.account.companyId,
    };
  }

  /** 給帳號一個帶 typeAdmin 的 Role。 */
  async function grantTypeAdmin(companyId: string, accountId: string): Promise<void> {
    const level: LevelDefinition = {
      id: randomUUID(),
      companyId,
      name: '管理',
      system: false,
      canRead: true,
      canComment: false,
      canCreate: false,
      canEditOwn: false,
      canEditAny: false,
      canArchive: false,
      canStructure: false,
      canAssignRole: false,
      createdOn: 0,
      updatedOn: 0,
    };
    await insertLevelDefinition(pool, level);
    const role: Role = {
      id: randomUUID(),
      companyId,
      roleTitle: '型別維護',
      levelId: level.id,
      typeAdmin: true,
      orgAdmin: false,
      permAdmin: false,
      tags: null,
      createdOn: 0,
      updatedOn: 0,
    };
    await insertRole(pool, role);
    await insertAccountRole(pool, {
      id: randomUUID(),
      companyId,
      accountId,
      roleId: role.id,
      createdOn: 0,
      updatedOn: 0,
    });
  }

  function get(url: string, cookie: string) {
    return app.inject({ method: 'GET', url, headers: { cookie } });
  }

  it('未登入存取 GET / 回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/calendars' });
    expect(res.statusCode).toBe(401);
  });

  it('typeAdmin 建立日曆回 201，並可列出與取回', async () => {
    const op = await register('a@example.com', 'A');
    await grantTypeAdmin(op.companyId, op.accountId);

    const create = await app.inject({
      method: 'POST',
      url: '/api/calendars',
      headers: { cookie: op.cookie },
      payload: { name: '台灣', weeklyOff: ['SAT', 'SUN'] },
    });
    expect(create.statusCode).toBe(201);

    const list = await get('/api/calendars', op.cookie);
    expect(list.json().calendars).toHaveLength(1);
    expect(list.json().calendars[0].name).toBe('台灣');

    const one = await get('/api/calendars/台灣', op.cookie);
    expect(one.statusCode).toBe(200);
    expect(one.json().calendar.weeklyOff).toEqual(['SAT', 'SUN']);
  });

  it('無 typeAdmin 建立日曆回 403 FORBIDDEN', async () => {
    const member = await register('m@example.com', 'M');
    const res = await app.inject({
      method: 'POST',
      url: '/api/calendars',
      headers: { cookie: member.cookie },
      payload: { name: '台灣', weeklyOff: ['SUN'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('重複建立同名日曆回 409 CALENDAR_EXISTS', async () => {
    const op = await register('a@example.com', 'A');
    await grantTypeAdmin(op.companyId, op.accountId);
    const payload = { name: '台灣', weeklyOff: ['SUN'] };
    await app.inject({ method: 'POST', url: '/api/calendars', headers: { cookie: op.cookie }, payload });
    const dup = await app.inject({
      method: 'POST',
      url: '/api/calendars',
      headers: { cookie: op.cookie },
      payload,
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CALENDAR_EXISTS');
  });

  it('更新週規則回 200 並改寫', async () => {
    const op = await register('a@example.com', 'A');
    await grantTypeAdmin(op.companyId, op.accountId);
    await app.inject({
      method: 'POST',
      url: '/api/calendars',
      headers: { cookie: op.cookie },
      payload: { name: '台灣', weeklyOff: ['SUN'] },
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/calendars/台灣/weekly-off',
      headers: { cookie: op.cookie },
      payload: { weeklyOff: ['SAT', 'SUN'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().calendar.weeklyOff).toEqual(['SAT', 'SUN']);
  });

  it('寫入與刪除例外，讀回反映變動', async () => {
    const op = await register('a@example.com', 'A');
    await grantTypeAdmin(op.companyId, op.accountId);
    await app.inject({
      method: 'POST',
      url: '/api/calendars',
      headers: { cookie: op.cookie },
      payload: { name: '台灣', weeklyOff: ['SUN'] },
    });

    const upsert = await app.inject({
      method: 'PUT',
      url: '/api/calendars/台灣/exceptions/2026-01-01',
      headers: { cookie: op.cookie },
      payload: { isWorking: false },
    });
    expect(upsert.statusCode).toBe(200);

    let one = await get('/api/calendars/台灣', op.cookie);
    expect(one.json().calendar.exceptions).toEqual([{ date: '2026-01-01', isWorking: false }]);

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/calendars/台灣/exceptions/2026-01-01',
      headers: { cookie: op.cookie },
    });
    expect(del.statusCode).toBe(200);

    one = await get('/api/calendars/台灣', op.cookie);
    expect(one.json().calendar.exceptions).toEqual([]);
  });

  it('取不存在日曆回 404', async () => {
    const op = await register('a@example.com', 'A');
    const res = await get('/api/calendars/不存在', op.cookie);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('日期格式不合回 400 INVALID_INPUT', async () => {
    const op = await register('a@example.com', 'A');
    await grantTypeAdmin(op.companyId, op.accountId);
    await app.inject({
      method: 'POST',
      url: '/api/calendars',
      headers: { cookie: op.cookie },
      payload: { name: '台灣', weeklyOff: ['SUN'] },
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/calendars/台灣/exceptions/2026-1-1',
      headers: { cookie: op.cookie },
      payload: { isWorking: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('租戶範圍：另一 Company 看不到本 Company 日曆', async () => {
    const op = await register('a@example.com', 'A');
    await grantTypeAdmin(op.companyId, op.accountId);
    await app.inject({
      method: 'POST',
      url: '/api/calendars',
      headers: { cookie: op.cookie },
      payload: { name: '台灣', weeklyOff: ['SUN'] },
    });
    // 另一 Company 直插日曆，本操作者不應看見
    const other = randomUUID();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1,$2)', [other, 'Other']);
    await pool.query('INSERT INTO calendar_definitions (company_id, name, weekly_off) VALUES ($1,$2,$3)', [
      other,
      '他司日曆',
      JSON.stringify(['SAT']),
    ]);

    const list = await get('/api/calendars', op.cookie);
    expect(list.json().calendars.map((c: { name: string }) => c.name)).toEqual(['台灣']);
  });
});
