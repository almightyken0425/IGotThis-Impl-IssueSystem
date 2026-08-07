import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import { withTransaction } from '../../db/client.js';
import { containerRepo } from '../../db/repositories/index.js';
import { validateIssueSetKey } from '../../domain/index.js';
import { isUniqueViolation, sendError, sendValidationFailure } from '../errors.js';

// 容器骨架路由：Company / Team / Product / Mgmt / IssueSet 的 CRUD。
//
// 本層只做協定轉換：schema 驗輸入、從 session 取租戶鍵、呼叫 containerRepo、對應錯誤碼。
// 租戶範圍：全路由掛 requireAuth，讀寫一律帶 identity.companyId，跨 Company 資料互不可見。
// 寫入完整性：工單集 KEY 先過 domain 的 validateIssueSetKey（格式檢查）；
//             同 Company KEY 撞號由 DB 唯一約束兜底，收斂為 409。
//
// Company 只開放讀取與改名、且鎖定 session 當前租戶：list / create / delete 會跨越
// 每條路由共守的租戶邊界，故不在此暴露；Company 的建立走註冊流程（auth 層自動植入）。

export interface ContainerRoutesOptions {
  readonly pool: Pool;
  readonly requireAuth: preHandlerHookHandler;
}

// ---- 共用 schema 片段 ----

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const nameBodySchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
} as const;

function idParams(key: string) {
  return {
    type: 'object',
    required: [key],
    additionalProperties: false,
    properties: { [key]: { type: 'string', pattern: UUID_PATTERN } },
  } as const;
}

interface NameBody {
  readonly name: string;
}

export const containerRoutes: FastifyPluginAsync<ContainerRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, requireAuth } = opts;

  // 全路由需登入；每條 handler 以 currentIdentity 取租戶鍵。
  app.addHook('preHandler', requireAuth);

  // ==========================================================
  // Company（鎖 session 當前租戶：讀取 + 改名）
  // ==========================================================

  app.get('/company', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const company = await containerRepo.getCompany(companyId, pool);
    if (company === undefined) {
      return sendError(reply, 404, 'NOT_FOUND', 'Company 不存在');
    }
    return reply.status(200).send({ company });
  });

  app.patch<{ Body: NameBody }>(
    '/company',
    { schema: { body: nameBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const company = await containerRepo.renameCompany(companyId, request.body.name, pool);
      if (company === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Company 不存在');
      }
      return reply.status(200).send({ company });
    },
  );

  // ==========================================================
  // Teams
  // ==========================================================

  app.post<{ Body: NameBody }>(
    '/teams',
    { schema: { body: nameBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const team = await containerRepo.createTeam(
        { id: randomUUID(), companyId, name: request.body.name },
        pool,
      );
      return reply.status(201).send({ team });
    },
  );

  app.get('/teams', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const teams = await containerRepo.listTeamsByCompany(companyId, pool);
    return reply.status(200).send({ teams });
  });

  app.get<{ Params: { teamId: string } }>(
    '/teams/:teamId',
    { schema: { params: idParams('teamId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const team = await containerRepo.getTeam(companyId, request.params.teamId, pool);
      if (team === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Team 不存在');
      }
      return reply.status(200).send({ team });
    },
  );

  app.patch<{ Params: { teamId: string }; Body: NameBody }>(
    '/teams/:teamId',
    { schema: { params: idParams('teamId'), body: nameBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const team = await containerRepo.renameTeam(
        companyId,
        request.params.teamId,
        request.body.name,
        pool,
      );
      if (team === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Team 不存在');
      }
      return reply.status(200).send({ team });
    },
  );

  app.delete<{ Params: { teamId: string } }>(
    '/teams/:teamId',
    { schema: { params: idParams('teamId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const removed = await containerRepo.deleteTeam(companyId, request.params.teamId, pool);
      if (!removed) {
        return sendError(reply, 404, 'NOT_FOUND', 'Team 不存在');
      }
      return reply.status(204).send();
    },
  );

  // ==========================================================
  // Products
  // ==========================================================

  app.post<{ Body: { teamId: string; name: string } }>(
    '/products',
    {
      schema: {
        body: {
          type: 'object',
          required: ['teamId', 'name'],
          additionalProperties: false,
          properties: {
            teamId: { type: 'string', pattern: UUID_PATTERN },
            name: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      // 引用的 Team 須在租戶內；products.team_id 外鍵非複合，故在此把關跨租戶引用。
      const team = await containerRepo.getTeam(companyId, request.body.teamId, pool);
      if (team === undefined) {
        return sendError(reply, 422, 'TEAM_NOT_FOUND', '指定的 Team 不存在');
      }
      const product = await containerRepo.createProduct(
        { id: randomUUID(), companyId, teamId: request.body.teamId, name: request.body.name },
        pool,
      );
      return reply.status(201).send({ product });
    },
  );

  app.get<{ Params: { teamId: string } }>(
    '/teams/:teamId/products',
    { schema: { params: idParams('teamId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const products = await containerRepo.listProductsByTeam(
        companyId,
        request.params.teamId,
        pool,
      );
      return reply.status(200).send({ products });
    },
  );

  app.get<{ Params: { productId: string } }>(
    '/products/:productId',
    { schema: { params: idParams('productId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const product = await containerRepo.getProduct(companyId, request.params.productId, pool);
      if (product === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Product 不存在');
      }
      return reply.status(200).send({ product });
    },
  );

  app.patch<{ Params: { productId: string }; Body: NameBody }>(
    '/products/:productId',
    { schema: { params: idParams('productId'), body: nameBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const product = await containerRepo.renameProduct(
        companyId,
        request.params.productId,
        request.body.name,
        pool,
      );
      if (product === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Product 不存在');
      }
      return reply.status(200).send({ product });
    },
  );

  app.delete<{ Params: { productId: string } }>(
    '/products/:productId',
    { schema: { params: idParams('productId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const removed = await containerRepo.deleteProduct(companyId, request.params.productId, pool);
      if (!removed) {
        return sendError(reply, 404, 'NOT_FOUND', 'Product 不存在');
      }
      return reply.status(204).send();
    },
  );

  // ==========================================================
  // Mgmts
  //
  // 管理域的 container_issue_set_id 為 NOT NULL、對工單集有 DEFERRABLE 外鍵，
  // 因此建立管理域必連帶建其初始工單集，兩筆插入同交易閉環。
  // ==========================================================

  app.post<{
    Params: { productId: string };
    Body: { name: string; issueSet: { name: string; key: string } };
  }>(
    '/products/:productId/mgmts',
    {
      schema: {
        params: idParams('productId'),
        body: {
          type: 'object',
          required: ['name', 'issueSet'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            issueSet: {
              type: 'object',
              required: ['name', 'key'],
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 200 },
                key: { type: 'string', minLength: 1, maxLength: 32 },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const { name, issueSet } = request.body;

      // 工單集 KEY 格式檢查（長度、字元、不可數字開頭）；撞號由 DB 唯一約束兜底。
      const keyCheck = validateIssueSetKey({ key: issueSet.key, companyId, existingIssueSets: [] });
      if (!keyCheck.ok) {
        return sendValidationFailure(reply, keyCheck);
      }

      try {
        const created = await withTransaction(async (tx) => {
          const product = await containerRepo.getProduct(companyId, request.params.productId, tx);
          if (product === undefined) return undefined;
          return containerRepo.createMgmtWithInitialIssueSet(
            {
              mgmt: { id: randomUUID(), companyId, productId: product.id, name },
              issueSet: { id: randomUUID(), companyId, name: issueSet.name, key: issueSet.key },
            },
            tx,
          );
        }, pool);
        if (created === undefined) {
          return sendError(reply, 422, 'PRODUCT_NOT_FOUND', '指定的 Product 不存在');
        }
        return reply.status(201).send(created);
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          return sendError(reply, 409, 'DUPLICATE_KEY', '同一 Company 內已存在相同工單集 KEY');
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { productId: string } }>(
    '/products/:productId/mgmts',
    { schema: { params: idParams('productId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const mgmts = await containerRepo.listMgmtsByProduct(companyId, request.params.productId, pool);
      return reply.status(200).send({ mgmts });
    },
  );

  app.get<{ Params: { mgmtId: string } }>(
    '/mgmts/:mgmtId',
    { schema: { params: idParams('mgmtId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const mgmt = await containerRepo.getMgmt(companyId, request.params.mgmtId, pool);
      if (mgmt === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Mgmt 不存在');
      }
      return reply.status(200).send({ mgmt });
    },
  );

  app.patch<{ Params: { mgmtId: string }; Body: NameBody }>(
    '/mgmts/:mgmtId',
    { schema: { params: idParams('mgmtId'), body: nameBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const mgmt = await containerRepo.renameMgmt(
        companyId,
        request.params.mgmtId,
        request.body.name,
        pool,
      );
      if (mgmt === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'Mgmt 不存在');
      }
      return reply.status(200).send({ mgmt });
    },
  );

  app.delete<{ Params: { mgmtId: string } }>(
    '/mgmts/:mgmtId',
    { schema: { params: idParams('mgmtId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const removed = await containerRepo.deleteMgmt(companyId, request.params.mgmtId, pool);
      if (!removed) {
        return sendError(reply, 404, 'NOT_FOUND', 'Mgmt 不存在');
      }
      return reply.status(204).send();
    },
  );

  // ==========================================================
  // IssueSets
  // ==========================================================

  app.post<{ Params: { mgmtId: string }; Body: { name: string; key: string } }>(
    '/mgmts/:mgmtId/issue-sets',
    {
      schema: {
        params: idParams('mgmtId'),
        body: {
          type: 'object',
          required: ['name', 'key'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            key: { type: 'string', minLength: 1, maxLength: 32 },
          },
        },
      },
    },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const { name, key } = request.body;

      const keyCheck = validateIssueSetKey({ key, companyId, existingIssueSets: [] });
      if (!keyCheck.ok) {
        return sendValidationFailure(reply, keyCheck);
      }

      const mgmt = await containerRepo.getMgmt(companyId, request.params.mgmtId, pool);
      if (mgmt === undefined) {
        return sendError(reply, 422, 'MGMT_NOT_FOUND', '指定的 Mgmt 不存在');
      }

      try {
        const issueSet = await containerRepo.createIssueSet(
          { id: randomUUID(), companyId, mgmtId: mgmt.id, name, key },
          pool,
        );
        return reply.status(201).send({ issueSet });
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          return sendError(reply, 409, 'DUPLICATE_KEY', '同一 Company 內已存在相同工單集 KEY');
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { mgmtId: string } }>(
    '/mgmts/:mgmtId/issue-sets',
    { schema: { params: idParams('mgmtId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const issueSets = await containerRepo.listIssueSetsByMgmt(
        companyId,
        request.params.mgmtId,
        pool,
      );
      return reply.status(200).send({ issueSets });
    },
  );

  app.get<{ Params: { issueSetId: string } }>(
    '/issue-sets/:issueSetId',
    { schema: { params: idParams('issueSetId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const issueSet = await containerRepo.getIssueSet(companyId, request.params.issueSetId, pool);
      if (issueSet === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'IssueSet 不存在');
      }
      return reply.status(200).send({ issueSet });
    },
  );

  app.patch<{ Params: { issueSetId: string }; Body: NameBody }>(
    '/issue-sets/:issueSetId',
    { schema: { params: idParams('issueSetId'), body: nameBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const issueSet = await containerRepo.renameIssueSet(
        companyId,
        request.params.issueSetId,
        request.body.name,
        pool,
      );
      if (issueSet === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', 'IssueSet 不存在');
      }
      return reply.status(200).send({ issueSet });
    },
  );

  app.delete<{ Params: { issueSetId: string } }>(
    '/issue-sets/:issueSetId',
    { schema: { params: idParams('issueSetId') } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const removed = await containerRepo.deleteIssueSet(
        companyId,
        request.params.issueSetId,
        pool,
      );
      if (!removed) {
        return sendError(reply, 404, 'NOT_FOUND', 'IssueSet 不存在');
      }
      return reply.status(204).send();
    },
  );
};
