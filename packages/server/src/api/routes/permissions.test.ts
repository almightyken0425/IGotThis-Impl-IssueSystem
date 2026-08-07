import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthConfig } from '../../auth/config.js';
import { loadEnv } from '../../db/env.js';
import { applyMigrations } from '../../db/migrate.js';
import {
  insertAccountRole,
  insertLevelDefinition,
  insertRole,
  insertRoleScope,
  type LevelDefinition,
  type Role,
  type ScopeKind,
} from '../../db/repositories/permissionRepo.js';
import { createServer } from '../index.js';

// 權限路由整合測試：以 Fastify inject 打真實路由，連 igotthis_test。
// 隔離：每個 case 前 TRUNCATE companies CASCADE，清空全租戶資料。
// 註冊路由建帳號與預設 Company；權限素材（等級 / Role / 範圍 / 分派）以 repository 直插種下。

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

suite('permission routes', () => {
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

  function makeLevel(companyId: string, grants: Partial<LevelDefinition>): LevelDefinition {
    return {
      id: randomUUID(),
      companyId,
      name: grants.name ?? 'L',
      system: false,
      canRead: false,
      canComment: false,
      canCreate: false,
      canEditOwn: false,
      canEditAny: false,
      canArchive: false,
      canStructure: false,
      canAssignRole: false,
      createdOn: 0,
      updatedOn: 0,
      ...grants,
    };
  }

  /** 種一個 Role（帶等級與範圍）並掛到帳號，讓該帳號取得對應有效權限。 */
  async function grant(
    companyId: string,
    accountId: string,
    opts: {
      level: Partial<LevelDefinition>;
      role?: Partial<Role>;
      scopes?: { kind: ScopeKind; id: string }[];
    },
  ): Promise<void> {
    const level = makeLevel(companyId, opts.level);
    await insertLevelDefinition(pool, level);
    const role: Role = {
      id: randomUUID(),
      companyId,
      roleTitle: 'seed',
      levelId: level.id,
      typeAdmin: false,
      orgAdmin: false,
      permAdmin: false,
      tags: null,
      createdOn: 0,
      updatedOn: 0,
      ...opts.role,
    };
    await insertRole(pool, role);
    for (const s of opts.scopes ?? []) {
      await insertRoleScope(pool, {
        id: randomUUID(),
        companyId,
        roleId: role.id,
        scopeKind: s.kind,
        scopeId: s.id,
        createdOn: 0,
        updatedOn: 0,
      });
    }
    await insertAccountRole(pool, {
      id: randomUUID(),
      companyId,
      accountId,
      roleId: role.id,
      createdOn: 0,
      updatedOn: 0,
    });
  }

  interface Containers {
    teamA: string;
    productA: string;
    mgmtA1: string;
    teamB: string;
    productB: string;
    mgmtB1: string;
  }

  /** 於同交易內種兩條容器骨架，環狀 FK 靠 deferrable 於 COMMIT 閉環。 */
  async function seedContainers(companyId: string): Promise<Containers> {
    const ids: Containers = {
      teamA: randomUUID(),
      productA: randomUUID(),
      mgmtA1: randomUUID(),
      teamB: randomUUID(),
      productB: randomUUID(),
      mgmtB1: randomUUID(),
    };
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      const branches: [string, string, string][] = [
        [ids.teamA, ids.productA, ids.mgmtA1],
        [ids.teamB, ids.productB, ids.mgmtB1],
      ];
      for (const [teamId, productId, mgmtId] of branches) {
        const issueSetId = randomUUID();
        await client.query('INSERT INTO teams (id, company_id, name) VALUES ($1,$2,$3)', [
          teamId,
          companyId,
          'T',
        ]);
        await client.query(
          'INSERT INTO products (id, company_id, team_id, name) VALUES ($1,$2,$3,$4)',
          [productId, companyId, teamId, 'P'],
        );
        await client.query(
          'INSERT INTO mgmts (id, company_id, product_id, name, container_issue_set_id) VALUES ($1,$2,$3,$4,$5)',
          [mgmtId, companyId, productId, 'M', issueSetId],
        );
        await client.query(
          'INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1,$2,$3,$4,$5)',
          [issueSetId, companyId, mgmtId, 'S', `K${issueSetId.slice(0, 4)}`],
        );
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return ids;
  }

  function get(url: string, cookie: string) {
    return app.inject({ method: 'GET', url, headers: { cookie } });
  }
  function post(url: string, cookie: string, payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url, headers: { cookie }, payload });
  }

  // ---- 認證與租戶 ----

  it('未登入存取 GET /levels 回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/permissions/levels' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('登入後 GET /levels 回空清單（尚未種等級）', async () => {
    const op = await register('a@example.com', 'A');
    const res = await get('/api/permissions/levels', op.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().levels).toEqual([]);
  });

  // ---- 等級 / Role 寫入需 permAdmin ----

  it('permAdmin 操作者 POST /levels 回 201，並可讀回', async () => {
    const op = await register('a@example.com', 'A');
    await grant(op.companyId, op.accountId, { level: { canRead: true }, role: { permAdmin: true } });

    const res = await post('/api/permissions/levels', op.cookie, {
      name: '自訂',
      canRead: true,
      canCreate: true,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().level.name).toBe('自訂');

    const list = await get('/api/permissions/levels', op.cookie);
    expect(list.json().levels.map((l: LevelDefinition) => l.name)).toContain('自訂');
  });

  it('無 permAdmin 帳號 POST /levels 回 403 FORBIDDEN', async () => {
    const member = await register('m@example.com', 'M');
    await grant(member.companyId, member.accountId, { level: { canRead: true } });

    const res = await post('/api/permissions/levels', member.cookie, { name: 'X' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('POST /roles 需 permAdmin，成功後 GET /roles/:id 回 Role 與範圍', async () => {
    const op = await register('a@example.com', 'A');
    await grant(op.companyId, op.accountId, { level: { canRead: true }, role: { permAdmin: true } });
    const containers = await seedContainers(op.companyId);

    // 先建一個等級供 Role 引用
    const levelRes = await post('/api/permissions/levels', op.cookie, { name: '成員', canRead: true });
    const levelId = levelRes.json().level.id as string;

    const roleRes = await post('/api/permissions/roles', op.cookie, {
      roleTitle: '產品管理',
      levelId,
      typeAdmin: true,
      scopes: [{ scopeKind: 'mgmt', scopeId: containers.mgmtA1 }],
    });
    expect(roleRes.statusCode).toBe(201);
    const roleId = roleRes.json().role.id as string;

    const getRes = await get(`/api/permissions/roles/${roleId}`, op.cookie);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().role.roleTitle).toBe('產品管理');
    expect(getRes.json().scopes).toHaveLength(1);
    expect(getRes.json().scopes[0].scopeId).toBe(containers.mgmtA1);
  });

  it('POST /roles 引用不存在等級回 422 LEVEL_NOT_FOUND', async () => {
    const op = await register('a@example.com', 'A');
    await grant(op.companyId, op.accountId, { level: { canRead: true }, role: { permAdmin: true } });

    const res = await post('/api/permissions/roles', op.cookie, {
      roleTitle: 'X',
      levelId: randomUUID(),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('LEVEL_NOT_FOUND');
  });

  it('輸入不合法回 400 INVALID_INPUT', async () => {
    const op = await register('a@example.com', 'A');
    await grant(op.companyId, op.accountId, { level: { canRead: true }, role: { permAdmin: true } });
    const res = await post('/api/permissions/roles', op.cookie, { roleTitle: 'X' }); // 缺 levelId
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_INPUT');
  });

  // ---- 分派 Role 三檢查 ----

  it('分派成功：操作者具分派能力、範圍與等級皆不越界回 201', async () => {
    const op = await register('a@example.com', 'A');
    const target = await register('t@example.com', 'T');
    const containers = await seedContainers(op.companyId);
    // 操作者：team A 範圍、可分派、canEditAny
    await grant(op.companyId, op.accountId, {
      level: { canRead: true, canEditAny: true, canAssignRole: true },
      scopes: [{ kind: 'team', id: containers.teamA }],
    });
    // 待分派 Role：mgmt A1 範圍（在 team A 內）、只讀（不越等級）
    const level = makeLevel(op.companyId, { canRead: true, name: '觀看' });
    await insertLevelDefinition(pool, level);
    const role: Role = {
      id: randomUUID(),
      companyId: op.companyId,
      roleTitle: '受派',
      levelId: level.id,
      typeAdmin: false,
      orgAdmin: false,
      permAdmin: false,
      tags: null,
      createdOn: 0,
      updatedOn: 0,
    };
    await insertRole(pool, role);
    await insertRoleScope(pool, {
      id: randomUUID(),
      companyId: op.companyId,
      roleId: role.id,
      scopeKind: 'mgmt',
      scopeId: containers.mgmtA1,
      createdOn: 0,
      updatedOn: 0,
    });

    const res = await post(`/api/permissions/accounts/${target.accountId}/roles`, op.cookie, {
      roleId: role.id,
    });
    expect(res.statusCode).toBe(201);

    const links = await get(`/api/permissions/accounts/${target.accountId}/roles`, op.cookie);
    expect(links.json().accountRoles).toHaveLength(1);
  });

  it('分派拒絕：操作者無分派開關回 403 ASSIGN_FORBIDDEN', async () => {
    const op = await register('a@example.com', 'A');
    const target = await register('t@example.com', 'T');
    await grant(op.companyId, op.accountId, {
      level: { canRead: true },
      scopes: [{ kind: 'company', id: op.companyId }],
    });
    const level = makeLevel(op.companyId, { canRead: true });
    await insertLevelDefinition(pool, level);
    const role: Role = {
      id: randomUUID(),
      companyId: op.companyId,
      roleTitle: 'R',
      levelId: level.id,
      typeAdmin: false,
      orgAdmin: false,
      permAdmin: false,
      tags: null,
      createdOn: 0,
      updatedOn: 0,
    };
    await insertRole(pool, role);

    const res = await post(`/api/permissions/accounts/${target.accountId}/roles`, op.cookie, {
      roleId: role.id,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ASSIGN_FORBIDDEN');
  });

  it('分派拒絕：目標範圍超出操作者範圍回 403 SCOPE_EXCEEDED', async () => {
    const op = await register('a@example.com', 'A');
    const target = await register('t@example.com', 'T');
    const containers = await seedContainers(op.companyId);
    await grant(op.companyId, op.accountId, {
      level: { canRead: true, canAssignRole: true },
      scopes: [{ kind: 'team', id: containers.teamA }],
    });
    const level = makeLevel(op.companyId, { canRead: true });
    await insertLevelDefinition(pool, level);
    const role: Role = {
      id: randomUUID(),
      companyId: op.companyId,
      roleTitle: 'R',
      levelId: level.id,
      typeAdmin: false,
      orgAdmin: false,
      permAdmin: false,
      tags: null,
      createdOn: 0,
      updatedOn: 0,
    };
    await insertRole(pool, role);
    await insertRoleScope(pool, {
      id: randomUUID(),
      companyId: op.companyId,
      roleId: role.id,
      scopeKind: 'mgmt',
      scopeId: containers.mgmtB1, // team B 之下，超出操作者 team A
      createdOn: 0,
      updatedOn: 0,
    });

    const res = await post(`/api/permissions/accounts/${target.accountId}/roles`, op.cookie, {
      roleId: role.id,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('SCOPE_EXCEEDED');
  });

  it('分派拒絕：目標等級高於操作者等級回 403 LEVEL_EXCEEDED', async () => {
    const op = await register('a@example.com', 'A');
    const target = await register('t@example.com', 'T');
    const containers = await seedContainers(op.companyId);
    // 操作者：可分派但不可封存
    await grant(op.companyId, op.accountId, {
      level: { canRead: true, canAssignRole: true },
      scopes: [{ kind: 'team', id: containers.teamA }],
    });
    // 目標等級帶封存，超出操作者
    const level = makeLevel(op.companyId, { canRead: true, canArchive: true });
    await insertLevelDefinition(pool, level);
    const role: Role = {
      id: randomUUID(),
      companyId: op.companyId,
      roleTitle: 'R',
      levelId: level.id,
      typeAdmin: false,
      orgAdmin: false,
      permAdmin: false,
      tags: null,
      createdOn: 0,
      updatedOn: 0,
    };
    await insertRole(pool, role);
    await insertRoleScope(pool, {
      id: randomUUID(),
      companyId: op.companyId,
      roleId: role.id,
      scopeKind: 'mgmt',
      scopeId: containers.mgmtA1,
      createdOn: 0,
      updatedOn: 0,
    });

    const res = await post(`/api/permissions/accounts/${target.accountId}/roles`, op.cookie, {
      roleId: role.id,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('LEVEL_EXCEEDED');
  });

  it('撤除分派：DELETE 回 200，清單歸零', async () => {
    const op = await register('a@example.com', 'A');
    const target = await register('t@example.com', 'T');
    const containers = await seedContainers(op.companyId);
    await grant(op.companyId, op.accountId, {
      level: { canRead: true, canAssignRole: true },
      scopes: [{ kind: 'company', id: op.companyId }],
    });
    const level = makeLevel(op.companyId, { canRead: true });
    await insertLevelDefinition(pool, level);
    const role: Role = {
      id: randomUUID(),
      companyId: op.companyId,
      roleTitle: 'R',
      levelId: level.id,
      typeAdmin: false,
      orgAdmin: false,
      permAdmin: false,
      tags: null,
      createdOn: 0,
      updatedOn: 0,
    };
    await insertRole(pool, role);
    await insertRoleScope(pool, {
      id: randomUUID(),
      companyId: op.companyId,
      roleId: role.id,
      scopeKind: 'mgmt',
      scopeId: containers.mgmtA1,
      createdOn: 0,
      updatedOn: 0,
    });

    const assign = await post(`/api/permissions/accounts/${target.accountId}/roles`, op.cookie, {
      roleId: role.id,
    });
    const assignmentId = assign.json().accountRole.id as string;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/permissions/accounts/${target.accountId}/roles/${assignmentId}`,
      headers: { cookie: op.cookie },
    });
    expect(del.statusCode).toBe(200);

    const links = await get(`/api/permissions/accounts/${target.accountId}/roles`, op.cookie);
    expect(links.json().accountRoles).toHaveLength(0);
  });

  // ---- 有效權限查詢 ----

  it('GET /effective 反映查核位置的等級聯集與公司層開關', async () => {
    const op = await register('a@example.com', 'A');
    const containers = await seedContainers(op.companyId);
    await grant(op.companyId, op.accountId, {
      level: { canRead: true, canEditAny: true },
      role: { typeAdmin: true },
      scopes: [{ kind: 'mgmt', id: containers.mgmtA1 }],
    });

    const atA1 = await get(
      `/api/permissions/effective?kind=mgmt&id=${containers.mgmtA1}`,
      op.cookie,
    );
    expect(atA1.statusCode).toBe(200);
    expect(atA1.json().effective.canEditAny).toBe(true);
    expect(atA1.json().effective.typeAdmin).toBe(true);

    const atB1 = await get(
      `/api/permissions/effective?kind=mgmt&id=${containers.mgmtB1}`,
      op.cookie,
    );
    expect(atB1.json().effective.canEditAny).toBe(false);
    // 公司層開關不吃範圍，仍為真
    expect(atB1.json().effective.typeAdmin).toBe(true);
  });

  // ---- 租戶隔離 ----

  it('租戶範圍：只看得到自身 Company 的等級', async () => {
    const op = await register('a@example.com', 'A');
    // 直插另一 Company 的等級，操作者不應看見
    const otherCompany = randomUUID();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1,$2)', [otherCompany, 'Other']);
    await insertLevelDefinition(pool, makeLevel(otherCompany, { name: '他司等級', canRead: true }));

    const res = await get('/api/permissions/levels', op.cookie);
    expect(res.json().levels.map((l: LevelDefinition) => l.name)).not.toContain('他司等級');
  });
});
