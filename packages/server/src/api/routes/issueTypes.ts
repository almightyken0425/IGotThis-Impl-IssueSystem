import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import { withTransaction } from '../../db/client.js';
import { fieldRepo, issueRepo } from '../../db/repositories/index.js';
import type { IssueTypeDefinition } from '../../db/repositories/index.js';
import { sendError } from '../errors.js';

// 工單型別路由：/api/issue-types 之下的工單型別讀寫。
//
// 本層只做協定轉換：schema 驗輸入、帶租戶鍵呼叫 repository、把結果碼轉 HTTP。
// 邊界：
// - 識別名稱在 Company 內唯一，重複先查再回 409
// - fieldSets 逐一核對欄位組定義存在，不存在回 422
// - 建立型別時一併呼叫 issueRepo.initializeTypeWorkflow 帶入預設流程，
//   兩步同交易，避免留下沒有流程定義的半成品型別
// - 不開 DELETE：畫面互動清單沒有刪除工單型別這個操作

export interface IssueTypeRoutesOptions {
  readonly pool: Pool;
  readonly requireAuth: preHandlerHookHandler;
}

// ---- 輸入 schema ----

const issueTypeBodySchema = {
  type: 'object',
  required: ['name', 'label', 'fieldSets'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    label: { type: 'string', minLength: 1, maxLength: 200 },
    fieldSets: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
} as const;

const issueTypePatchBodySchema = {
  type: 'object',
  required: ['label', 'fieldSets'],
  additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 200 },
    fieldSets: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
} as const;

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } },
} as const;

interface IssueTypeBody {
  readonly name: string;
  readonly label: string;
  readonly fieldSets: readonly string[];
}

interface IssueTypePatchBody {
  readonly label: string;
  readonly fieldSets: readonly string[];
}

/** 逐一核對 fieldSets 清單裡的欄位組都存在；回傳缺漏的名稱，全存在則回空陣列。 */
async function findMissingFieldSets(
  companyId: string,
  fieldSets: readonly string[],
  pool: Pool,
): Promise<string[]> {
  const checks = await Promise.all(
    fieldSets.map(async (name) => ({ name, exists: (await fieldRepo.findFieldSet(companyId, name, pool)) !== undefined })),
  );
  return checks.filter((c) => !c.exists).map((c) => c.name);
}

export const issueTypeRoutes: FastifyPluginAsync<IssueTypeRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, requireAuth } = opts;

  app.addHook('preHandler', requireAuth);

  // 建立工單型別；名稱在 Company 內唯一，fieldSets 逐一須存在。
  // 交易內建型別 + 帶入預設流程，兩步失敗則整批回滾。
  app.post<{ Body: IssueTypeBody }>(
    '/',
    { schema: { body: issueTypeBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const body = request.body;

      const existing = await issueRepo.getIssueTypeByName(companyId, body.name, pool);
      if (existing !== undefined) {
        return sendError(reply, 409, 'ISSUE_TYPE_NAME_TAKEN', '工單型別名稱已存在');
      }
      const missing = await findMissingFieldSets(companyId, body.fieldSets, pool);
      if (missing.length > 0) {
        return sendError(reply, 422, 'FIELD_SET_NOT_FOUND', `欄位組不存在：${missing.join('、')}`);
      }

      const issueType = await withTransaction<IssueTypeDefinition>(async (tx) => {
        const created = await issueRepo.createIssueType(
          {
            id: randomUUID(),
            companyId,
            name: body.name,
            label: body.label,
            fieldSets: body.fieldSets,
            system: false,
          },
          tx,
        );
        await issueRepo.initializeTypeWorkflow(companyId, created.id, undefined, tx);
        return created;
      }, pool);

      return reply.status(201).send({ issueType });
    },
  );

  // 列出本 Company 的工單型別，依名稱排序。
  app.get('/', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const issueTypes = await issueRepo.listIssueTypes(companyId, pool);
    return reply.status(200).send({ issueTypes });
  });

  // 改工單型別的顯示名稱與欄位組配方；識別名稱與系統旗標不動。
  app.patch<{ Params: { id: string }; Body: IssueTypePatchBody }>(
    '/:id',
    { schema: { params: idParamsSchema, body: issueTypePatchBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const missing = await findMissingFieldSets(companyId, request.body.fieldSets, pool);
      if (missing.length > 0) {
        return sendError(reply, 422, 'FIELD_SET_NOT_FOUND', `欄位組不存在：${missing.join('、')}`);
      }
      const updated = await issueRepo.updateIssueType(companyId, request.params.id, request.body, pool);
      if (updated === undefined) {
        return sendError(reply, 404, 'ISSUE_TYPE_NOT_FOUND', '工單型別不存在');
      }
      return reply.status(200).send({ issueType: updated });
    },
  );
};
