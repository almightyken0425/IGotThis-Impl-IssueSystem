import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import { withTransaction } from '../../db/client.js';
import { fieldRepo, issueRepo, relationRepo, viewRepo } from '../../db/repositories/index.js';
import type { View } from '../../db/repositories/index.js';
import { buildKanbanColumns, computeRollupValue, RollupError, WORK_LOG_FIELD_NAME } from '../../domain/index.js';
import type {
  FieldDef,
  IssueFieldRecord,
  IssueFieldValue,
  IssueTypeWorkflow,
  RollupFieldValue,
  RollupRelation,
  RollupRelationType,
  RollupSnapshot,
} from '../../domain/index.js';
import { sendError } from '../errors.js';

// 檢視路由：/api/views 之下的檢視 CRUD、看板欄序、彙總值計算。
//
// 本層只做協定轉換：schema 驗輸入、帶租戶鍵呼叫 repository、把 domain 純函式的結果轉 HTTP。
// domain 用法：
// - 看板欄序用 buildKanbanColumns，輸入由本 Company 的工單型別與流程狀態組成
// - 彙總值用 computeRollupValue，快照自目標工單沿關聯下探的子樹組成（只用既有 repository 查詢）
//   RollupError（欄位未定義 / 不可彙總 / 關聯成環）一律轉 422

export interface ViewRoutesOptions {
  readonly pool: Pool;
  readonly requireAuth: preHandlerHookHandler;
}

// ---- 輸入 schema ----

const createViewBodySchema = {
  type: 'object',
  required: ['name', 'viewType', 'sourceMgmtIds', 'displayLevel'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    viewType: { type: 'string', minLength: 1, maxLength: 50 },
    sourceMgmtIds: { type: 'array', items: { type: 'string', minLength: 1 } },
    displayLevel: { type: 'integer' },
    filterConfig: {},
    columnConfig: {},
    calendarName: { type: 'string', nullable: true },
  },
} as const;

const updateViewBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    columnConfig: {},
    filterConfig: {},
  },
} as const;

const listViewQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: { scope: { type: 'string', enum: ['mine', 'company'] } },
} as const;

const rollupQuerySchema = {
  type: 'object',
  required: ['issueId', 'fieldName'],
  additionalProperties: false,
  properties: {
    issueId: { type: 'string', minLength: 1 },
    fieldName: { type: 'string', minLength: 1 },
  },
} as const;

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } },
} as const;

interface CreateViewBody {
  readonly name: string;
  readonly viewType: string;
  readonly sourceMgmtIds: readonly string[];
  readonly displayLevel: number;
  readonly filterConfig?: unknown;
  readonly columnConfig?: unknown;
  readonly calendarName?: string | null;
}

interface UpdateViewBody {
  readonly columnConfig?: unknown;
  readonly filterConfig?: unknown;
}

/** 組本 Company 的工單型別與流程狀態清單，供 buildKanbanColumns。 */
async function loadIssueTypeWorkflows(pool: Pool, companyId: string): Promise<IssueTypeWorkflow[]> {
  const issueTypes = await issueRepo.listIssueTypes(companyId, pool);
  const workflows: IssueTypeWorkflow[] = [];
  for (const issueType of issueTypes) {
    const states = await issueRepo.listWorkflowStates(companyId, issueType.id, pool);
    workflows.push({
      issueTypeId: issueType.id,
      states: states.map((s) => ({ name: s.name, sortOrder: s.sortOrder })),
    });
  }
  return workflows;
}

/**
 * 自目標工單沿正向關聯下探，收集子樹的關聯邊與工單 id。
 * 只走既有 repository 的正查，遇已見過的工單仍記錄邊（供 domain 偵測環）但不重入隊。
 */
async function collectSubtree(
  pool: Pool,
  companyId: string,
  rootIssueId: string,
): Promise<{ relations: RollupRelation[]; issueIds: string[] }> {
  const relations: RollupRelation[] = [];
  const issueIds = new Set<string>([rootIssueId]);
  const enqueued = new Set<string>([rootIssueId]);
  const queue: string[] = [rootIssueId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const forward = await relationRepo.findRelationsFromIssue(companyId, current, undefined, pool);
    for (const rel of forward) {
      relations.push({
        companyId,
        fromIssueId: rel.fromIssueId,
        toIssueId: rel.toIssueId,
        relationTypeId: rel.relationTypeId,
      });
      issueIds.add(rel.toIssueId);
      if (!enqueued.has(rel.toIssueId)) {
        enqueued.add(rel.toIssueId);
        queue.push(rel.toIssueId);
      }
    }
  }
  return { relations, issueIds: [...issueIds] };
}

/** 組彙總快照：型別與欄位定義取全 Company，值與工時記錄限子樹工單。 */
async function buildRollupSnapshot(
  pool: Pool,
  companyId: string,
  rootIssueId: string,
): Promise<RollupSnapshot> {
  const [relationTypeDefs, storedFieldDefs, subtree] = await Promise.all([
    relationRepo.listRelationTypes(companyId, pool),
    fieldRepo.listFieldDefs(companyId, pool),
    collectSubtree(pool, companyId, rootIssueId),
  ]);

  const relationTypes: RollupRelationType[] = relationTypeDefs.map((t) => ({
    id: t.id,
    companyId: t.companyId,
    name: t.name,
    rollup: t.rollup,
  }));

  // 收窄成彙總只需的欄位定義投影。
  const fieldDefs: FieldDef[] = storedFieldDefs.map((d) => ({
    companyId: d.companyId,
    name: d.name,
    rollupable: d.rollupable,
    rollupFn: d.rollupFn,
  }));

  const fieldValues: IssueFieldValue[] = [];
  const fieldRecords: IssueFieldRecord[] = [];
  for (const issueId of subtree.issueIds) {
    const stored = await issueRepo.listFieldValues(companyId, issueId, pool);
    for (const row of stored) {
      if (isRollupFieldValue(row.value)) {
        fieldValues.push({
          companyId,
          issueId,
          fieldName: row.fieldName,
          value: row.value,
          rollupMode: row.rollupMode,
        });
      }
    }
    const records = await fieldRepo.listFieldRecords(companyId, issueId, WORK_LOG_FIELD_NAME, pool);
    for (const rec of records) {
      if (typeof rec.value === 'number') {
        fieldRecords.push({
          id: rec.id,
          companyId,
          issueId,
          fieldName: rec.fieldName,
          value: rec.value,
        });
      }
    }
  }

  return {
    companyId,
    relationTypes,
    relations: subtree.relations,
    fieldDefs,
    fieldValues,
    fieldRecords,
  };
}

function isRollupFieldValue(value: unknown): value is RollupFieldValue {
  return typeof value === 'number' || typeof value === 'string';
}

export const viewRoutes: FastifyPluginAsync<ViewRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, requireAuth } = opts;

  app.addHook('preHandler', requireAuth);

  // ---- 檢視 CRUD ----

  // 建立檢視；擁有者為當前帳號。
  app.post<{ Body: CreateViewBody }>(
    '/',
    { schema: { body: createViewBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      const body = request.body;
      const view: View = {
        id: randomUUID(),
        companyId,
        name: body.name,
        ownerId: accountId,
        viewType: body.viewType,
        sourceMgmtIds: [...body.sourceMgmtIds],
        filterConfig: body.filterConfig ?? null,
        displayLevel: body.displayLevel,
        columnConfig: body.columnConfig ?? null,
        calendarName: body.calendarName ?? null,
      };
      await viewRepo.insertView(pool, view);
      return reply.status(201).send({ view });
    },
  );

  // 列出檢視；scope=mine 取自己擁有的（預設），scope=company 取全 Company。
  app.get<{ Querystring: { scope?: 'mine' | 'company' } }>(
    '/',
    { schema: { querystring: listViewQuerySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      const views =
        request.query.scope === 'company'
          ? await viewRepo.listViewsByCompany(pool, companyId)
          : await viewRepo.listViewsByOwner(pool, companyId, accountId);
      return reply.status(200).send({ views });
    },
  );

  // 取單一檢視；查無回 404。
  app.get<{ Params: { id: string } }>(
    '/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const view = await viewRepo.getView(pool, companyId, request.params.id);
      if (view === undefined) {
        return sendError(reply, 404, 'VIEW_NOT_FOUND', '檢視不存在');
      }
      return reply.status(200).send({ view });
    },
  );

  // 更新檢視的欄位顯示設定與/或篩選條件；未帶的欄不動。查無回 404。
  app.patch<{ Params: { id: string }; Body: UpdateViewBody }>(
    '/:id',
    { schema: { params: idParamsSchema, body: updateViewBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const id = request.params.id;
      const existing = await viewRepo.getView(pool, companyId, id);
      if (existing === undefined) {
        return sendError(reply, 404, 'VIEW_NOT_FOUND', '檢視不存在');
      }
      if (request.body.columnConfig !== undefined) {
        await viewRepo.updateViewColumnConfig(pool, companyId, id, request.body.columnConfig);
      }
      if (request.body.filterConfig !== undefined) {
        await viewRepo.updateViewFilterConfig(pool, companyId, id, request.body.filterConfig);
      }
      const updated = await viewRepo.getView(pool, companyId, id);
      return reply.status(200).send({ view: updated });
    },
  );

  // 刪除檢視，連同其排序項；命中回 204，查無回 404。
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const deleted = await withTransaction(
        (tx) => viewRepo.deleteView(tx, companyId, request.params.id),
        pool,
      );
      if (!deleted) {
        return sendError(reply, 404, 'VIEW_NOT_FOUND', '檢視不存在');
      }
      return reply.status(204).send();
    },
  );

  // ---- 看板欄序 ----

  // 本 Company 的看板欄集合與欄序，由各工單型別的流程狀態保序併入。
  app.get('/kanban-columns', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const workflows = await loadIssueTypeWorkflows(pool, companyId);
    const columns = buildKanbanColumns(workflows);
    return reply.status(200).send({ columns });
  });

  // ---- 彙總 ----

  // 計算某工單某欄位的彙總值；快照自該工單下探子樹組成。
  app.get<{ Querystring: { issueId: string; fieldName: string } }>(
    '/rollup',
    { schema: { querystring: rollupQuerySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const { issueId, fieldName } = request.query;
      const snapshot = await buildRollupSnapshot(pool, companyId, issueId);
      try {
        const value = computeRollupValue(snapshot, issueId, fieldName);
        return reply.status(200).send({ value });
      } catch (error: unknown) {
        if (error instanceof RollupError) {
          return sendError(reply, 422, error.code, error.message);
        }
        throw error;
      }
    },
  );
};
