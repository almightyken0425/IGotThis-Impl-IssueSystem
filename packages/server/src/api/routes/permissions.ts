import { randomUUID } from 'node:crypto';

import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import {
  containerRepo,
  permissionRepo,
  type LevelDefinition,
  type Role,
  type RoleScope,
  type ScopeKind,
} from '../../db/repositories/index.js';
import {
  buildContainerIndex,
  checkRoleAssignment,
  computeEffectivePermission,
  hasCompanySwitch,
  type ContainerIndex,
} from '../../permission/index.js';
import { sendError } from '../errors.js';

// 權限路由：/api/permissions 之下的 Role 定義、分派、等級、標籤讀寫，與有效權限查詢。
//
// 本層只做協定轉換：schema 驗輸入、帶租戶鍵呼叫 repository、把授權判定結果轉 HTTP。
// 授權判定（有效權限計算、分派 Role 三檢查）全在 permission service，不在此。
//
// 寫入授權：
// - Role 定義 / 等級 / 標籤 的異動屬公司層權限管理開關 permAdmin（spec no4：permAdmin 管 Role 定義、等級定義、標籤群組定義）。
// - Role 分派 / 撤除 走 assignRole 三檢查：分派開關、範圍不越界、等級不越權（spec PermissionLogic assignRole）。
// 讀取：一律需登入、帶租戶範圍，不另設等級門檻。

export interface PermissionRoutesOptions {
  readonly pool: Pool;
  readonly requireAuth: preHandlerHookHandler;
}

const SCOPE_KINDS: readonly ScopeKind[] = ['company', 'team', 'product', 'mgmt'];

// ---- 輸入 schema ----

const levelBodySchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    canRead: { type: 'boolean' },
    canComment: { type: 'boolean' },
    canCreate: { type: 'boolean' },
    canEditOwn: { type: 'boolean' },
    canEditAny: { type: 'boolean' },
    canArchive: { type: 'boolean' },
    canStructure: { type: 'boolean' },
    canAssignRole: { type: 'boolean' },
  },
} as const;

const scopeItemSchema = {
  type: 'object',
  required: ['scopeKind', 'scopeId'],
  additionalProperties: false,
  properties: {
    scopeKind: { type: 'string', enum: SCOPE_KINDS as unknown as string[] },
    scopeId: { type: 'string', format: 'uuid' },
  },
} as const;

const roleBodySchema = {
  type: 'object',
  required: ['roleTitle', 'levelId'],
  additionalProperties: false,
  properties: {
    roleTitle: { type: 'string', minLength: 1, maxLength: 100 },
    levelId: { type: 'string', format: 'uuid' },
    typeAdmin: { type: 'boolean' },
    orgAdmin: { type: 'boolean' },
    permAdmin: { type: 'boolean' },
    scopes: { type: 'array', items: scopeItemSchema },
  },
} as const;

const tagGroupBodySchema = {
  type: 'object',
  required: ['name', 'target'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    target: { type: 'string', enum: ['account', 'role'] },
  },
} as const;

const tagValueBodySchema = {
  type: 'object',
  required: ['value'],
  additionalProperties: false,
  properties: {
    value: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const assignBodySchema = {
  type: 'object',
  required: ['roleId'],
  additionalProperties: false,
  properties: {
    roleId: { type: 'string', format: 'uuid' },
  },
} as const;

const effectiveQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: SCOPE_KINDS as unknown as string[] },
    id: { type: 'string', format: 'uuid' },
  },
} as const;

// ---- 輸入型別 ----

interface LevelBody {
  name: string;
  canRead?: boolean;
  canComment?: boolean;
  canCreate?: boolean;
  canEditOwn?: boolean;
  canEditAny?: boolean;
  canArchive?: boolean;
  canStructure?: boolean;
  canAssignRole?: boolean;
}

interface ScopeItem {
  scopeKind: ScopeKind;
  scopeId: string;
}

interface RoleBody {
  roleTitle: string;
  levelId: string;
  typeAdmin?: boolean;
  orgAdmin?: boolean;
  permAdmin?: boolean;
  scopes?: ScopeItem[];
}

export const permissionRoutes: FastifyPluginAsync<PermissionRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, requireAuth } = opts;

  // 全部權限路由需登入；companyId 由 session 身分帶入作租戶鍵。
  app.addHook('preHandler', requireAuth);

  /** 取當前操作者的 Role bundle，供公司層開關與分派授權判定。 */
  async function operatorBundles(companyId: string, accountId: string) {
    return permissionRepo.getEffectivePermissionInputs(pool, companyId, accountId);
  }

  /** 要求操作者持有某公司層開關，否則回 403。回傳是否通過。 */
  async function requireCompanySwitch(
    reply: FastifyReply,
    companyId: string,
    accountId: string,
    which: 'typeAdmin' | 'orgAdmin' | 'permAdmin',
    message: string,
  ): Promise<boolean> {
    const bundles = await operatorBundles(companyId, accountId);
    if (!hasCompanySwitch(bundles, which)) {
      void sendError(reply, 403, 'FORBIDDEN', message);
      return false;
    }
    return true;
  }

  /** 建容器歸屬索引，供範圍涵蓋判定。 */
  async function loadContainerIndex(companyId: string): Promise<ContainerIndex> {
    const tree = await containerRepo.getContainerTree(companyId, pool);
    /* v8 ignore next 3 -- 登入身分的 companyId 必對應存在的 Company */
    if (tree === undefined) {
      return buildContainerIndex({ id: companyId, name: '', teams: [] });
    }
    return buildContainerIndex(tree);
  }

  // ============================================================
  // 等級定義 LevelDefinitions
  // ============================================================

  app.get('/levels', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const levels = await permissionRepo.listLevelDefinitions(pool, companyId);
    return reply.status(200).send({ levels });
  });

  app.post<{ Body: LevelBody }>(
    '/levels',
    { schema: { body: levelBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireCompanySwitch(reply, companyId, accountId, 'permAdmin', '需權限管理才能新增等級'))) {
        return reply;
      }
      const now = Date.now();
      const b = request.body;
      const level: LevelDefinition = {
        id: randomUUID(),
        companyId,
        name: b.name,
        system: false,
        canRead: b.canRead ?? false,
        canComment: b.canComment ?? false,
        canCreate: b.canCreate ?? false,
        canEditOwn: b.canEditOwn ?? false,
        canEditAny: b.canEditAny ?? false,
        canArchive: b.canArchive ?? false,
        canStructure: b.canStructure ?? false,
        canAssignRole: b.canAssignRole ?? false,
        createdOn: now,
        updatedOn: now,
      };
      await permissionRepo.insertLevelDefinition(pool, level);
      return reply.status(201).send({ level });
    },
  );

  // ============================================================
  // 授權角色 Roles
  // ============================================================

  app.get('/roles', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const roles = await permissionRepo.listRoles(pool, companyId);
    return reply.status(200).send({ roles });
  });

  app.get<{ Params: { id: string } }>('/roles/:id', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const role = await permissionRepo.getRole(pool, companyId, request.params.id);
    if (role === undefined) {
      return sendError(reply, 404, 'NOT_FOUND', 'Role 不存在');
    }
    const scopes = await permissionRepo.listRoleScopes(pool, companyId, role.id);
    return reply.status(200).send({ role, scopes });
  });

  app.post<{ Body: RoleBody }>(
    '/roles',
    { schema: { body: roleBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireCompanySwitch(reply, companyId, accountId, 'permAdmin', '需權限管理才能新增 Role'))) {
        return reply;
      }
      const b = request.body;
      // 等級須存在於同租戶，否則 FK 會擲錯；先驗給出乾淨 422。
      const level = await permissionRepo.getLevelDefinition(pool, companyId, b.levelId);
      if (level === undefined) {
        return sendError(reply, 422, 'LEVEL_NOT_FOUND', '指定的等級不存在');
      }
      const now = Date.now();
      const role: Role = {
        id: randomUUID(),
        companyId,
        roleTitle: b.roleTitle,
        levelId: b.levelId,
        typeAdmin: b.typeAdmin ?? false,
        orgAdmin: b.orgAdmin ?? false,
        permAdmin: b.permAdmin ?? false,
        tags: null,
        createdOn: now,
        updatedOn: now,
      };
      await permissionRepo.insertRole(pool, role);

      const scopes: RoleScope[] = [];
      for (const item of b.scopes ?? []) {
        const scopeRow: RoleScope = {
          id: randomUUID(),
          companyId,
          roleId: role.id,
          scopeKind: item.scopeKind,
          scopeId: item.scopeId,
          createdOn: now,
          updatedOn: now,
        };
        await permissionRepo.insertRoleScope(pool, scopeRow);
        scopes.push(scopeRow);
      }
      return reply.status(201).send({ role, scopes });
    },
  );

  app.post<{ Params: { id: string }; Body: ScopeItem }>(
    '/roles/:id/scopes',
    { schema: { body: scopeItemSchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireCompanySwitch(reply, companyId, accountId, 'permAdmin', '需權限管理才能改 Role 範圍'))) {
        return reply;
      }
      const role = await permissionRepo.getRole(pool, companyId, request.params.id);
      if (role === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Role 不存在');
      }
      const now = Date.now();
      const scopeRow: RoleScope = {
        id: randomUUID(),
        companyId,
        roleId: role.id,
        scopeKind: request.body.scopeKind,
        scopeId: request.body.scopeId,
        createdOn: now,
        updatedOn: now,
      };
      await permissionRepo.insertRoleScope(pool, scopeRow);
      return reply.status(201).send({ scope: scopeRow });
    },
  );

  // ============================================================
  // 標籤群組 TagGroups / 標籤值 TagValues
  // ============================================================

  app.get('/tag-groups', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const tagGroups = await permissionRepo.listTagGroups(pool, companyId);
    return reply.status(200).send({ tagGroups });
  });

  app.post<{ Body: { name: string; target: 'account' | 'role' } }>(
    '/tag-groups',
    { schema: { body: tagGroupBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireCompanySwitch(reply, companyId, accountId, 'permAdmin', '需權限管理才能新增標籤群組'))) {
        return reply;
      }
      const now = Date.now();
      const group = {
        id: randomUUID(),
        companyId,
        name: request.body.name,
        target: request.body.target,
        system: false,
        createdOn: now,
        updatedOn: now,
      };
      await permissionRepo.insertTagGroup(pool, group);
      return reply.status(201).send({ tagGroup: group });
    },
  );

  app.get<{ Params: { id: string } }>('/tag-groups/:id/values', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const tagValues = await permissionRepo.listTagValues(pool, companyId, request.params.id);
    return reply.status(200).send({ tagValues });
  });

  app.post<{ Params: { id: string }; Body: { value: string } }>(
    '/tag-groups/:id/values',
    { schema: { body: tagValueBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireCompanySwitch(reply, companyId, accountId, 'permAdmin', '需權限管理才能新增標籤值'))) {
        return reply;
      }
      const now = Date.now();
      const value = {
        id: randomUUID(),
        companyId,
        tagGroupId: request.params.id,
        value: request.body.value,
        createdOn: now,
        updatedOn: now,
      };
      await permissionRepo.insertTagValue(pool, value);
      return reply.status(201).send({ tagValue: value });
    },
  );

  // ============================================================
  // Role 分派 AccountRoles
  // ============================================================

  app.get<{ Params: { accountId: string } }>(
    '/accounts/:accountId/roles',
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const links = await permissionRepo.listAccountRoles(pool, companyId, request.params.accountId);
      return reply.status(200).send({ accountRoles: links });
    },
  );

  app.post<{ Params: { accountId: string }; Body: { roleId: string } }>(
    '/accounts/:accountId/roles',
    { schema: { body: assignBodySchema } },
    async (request, reply) => {
      const { companyId, accountId: operatorId } = currentIdentity(request);
      const targetAccountId = request.params.accountId;
      const roleId = request.body.roleId;

      const targetAccount = await permissionRepo.getAccount(pool, companyId, targetAccountId);
      if (targetAccount === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', '目標帳號不存在');
      }
      const role = await permissionRepo.getRole(pool, companyId, roleId);
      if (role === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Role 不存在');
      }
      const level = await permissionRepo.getLevelDefinition(pool, companyId, role.levelId);
      /* v8 ignore next 3 -- role.levelId 有 FK 約束，取不到代表資料已壞 */
      if (level === undefined) {
        return sendError(reply, 422, 'LEVEL_NOT_FOUND', 'Role 的等級定義不存在');
      }
      const scopes = await permissionRepo.listRoleScopes(pool, companyId, role.id);

      const bundles = await operatorBundles(companyId, operatorId);
      const index = await loadContainerIndex(companyId);
      const decision = checkRoleAssignment(bundles, { level, scopes }, index);
      if (!decision.ok) {
        // 分派授權不足屬 403：語法正確但操作者無權。
        return sendError(reply, 403, decision.code, decision.reason);
      }

      const now = Date.now();
      const link = {
        id: randomUUID(),
        companyId,
        accountId: targetAccountId,
        roleId,
        createdOn: now,
        updatedOn: now,
      };
      await permissionRepo.insertAccountRole(pool, link);
      return reply.status(201).send({ accountRole: link });
    },
  );

  app.delete<{ Params: { accountId: string; assignmentId: string } }>(
    '/accounts/:accountId/roles/:assignmentId',
    async (request, reply) => {
      const { companyId, accountId: operatorId } = currentIdentity(request);
      const { accountId: targetAccountId, assignmentId } = request.params;

      const links = await permissionRepo.listAccountRoles(pool, companyId, targetAccountId);
      const link = links.find((l) => l.id === assignmentId);
      if (link === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Role 分派記錄不存在');
      }
      const role = await permissionRepo.getRole(pool, companyId, link.roleId);
      /* v8 ignore next 3 -- account_role.role_id 有 FK 約束 */
      if (role === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Role 不存在');
      }
      const level = await permissionRepo.getLevelDefinition(pool, companyId, role.levelId);
      /* v8 ignore next 3 -- role.levelId 有 FK 約束 */
      if (level === undefined) {
        return sendError(reply, 422, 'LEVEL_NOT_FOUND', 'Role 的等級定義不存在');
      }
      const scopes = await permissionRepo.listRoleScopes(pool, companyId, role.id);

      const bundles = await operatorBundles(companyId, operatorId);
      const index = await loadContainerIndex(companyId);
      // 撤除套用與分派同一授權範圍：具分派能力且該 Role 落在操作者範圍與等級內。
      const decision = checkRoleAssignment(bundles, { level, scopes }, index);
      if (!decision.ok) {
        return sendError(reply, 403, decision.code, decision.reason);
      }

      await permissionRepo.deleteAccountRole(pool, companyId, assignmentId);
      return reply.status(200).send({ ok: true });
    },
  );

  // ============================================================
  // 有效權限查詢
  // ============================================================

  app.get<{ Querystring: { kind?: ScopeKind; id?: string } }>(
    '/effective',
    { schema: { querystring: effectiveQuerySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      const { kind, id } = request.query;
      // kind 與 id 必須成對；只給其一視為無位置，只回公司層開關。
      const location = kind !== undefined && id !== undefined ? { kind, id } : undefined;

      const bundles = await operatorBundles(companyId, accountId);
      const index = await loadContainerIndex(companyId);
      const effective = computeEffectivePermission(bundles, index, location);
      return reply.status(200).send({ effective });
    },
  );
};
