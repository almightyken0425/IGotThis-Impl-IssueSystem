import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import { withTransaction } from '../../db/client.js';
import {
  calendarRepo,
  containerRepo,
  fieldRepo,
  issueRepo,
  permissionRepo,
  relationRepo,
  viewRepo,
} from '../../db/repositories/index.js';
import type { View } from '../../db/repositories/index.js';
import {
  admitNewContainerIssue,
  applyViewFilter,
  assignSortPosition,
  buildKanbanColumns,
  computeIssueDuration,
  computeRollupValue,
  resolveViewCalendar,
  RollupError,
  SortPositionError,
  WORK_LOG_FIELD_NAME,
} from '../../domain/index.js';
import type {
  FieldDef,
  FilterConfig,
  Issue,
  IssueDuration,
  IssueFieldRecord,
  IssueFieldValue,
  IssueFilterCandidate,
  IssueTypeWorkflow,
  IsoDate,
  RollupFieldValue,
  RollupRelation,
  RollupRelationType,
  RollupSnapshot,
} from '../../domain/index.js';
import { sendError } from '../errors.js';

// 檢視路由：/api/views 之下的檢視 CRUD、看板欄序、彙總值計算、檢視內容組裝。
//
// 本層只做協定轉換：schema 驗輸入、帶租戶鍵呼叫 repository、把 domain 純函式的結果轉 HTTP。
// domain 用法：
// - 看板欄序用 buildKanbanColumns，輸入由本 Company 的工單型別與流程狀態組成
// - 彙總值用 computeRollupValue，快照自目標工單沿關聯下探的子樹組成（只用既有 repository 查詢）
//   RollupError（欄位未定義 / 不可彙總 / 關聯成環）一律轉 422
// - 檢視內容（/:id/issues）串 applyViewFilter → admitNewContainerIssue → resolveViewCalendar
//   → computeIssueDuration 四個 domain 函式；回傳結果未經 filterViewByPermission 過濾，
//   權限過濾屬 permission_system 模組，不在這輪範圍

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
    calendarName: { type: 'string', nullable: true },
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

const sortParamsSchema = {
  type: 'object',
  required: ['id', 'issueId'],
  properties: {
    id: { type: 'string', minLength: 1 },
    issueId: { type: 'string', minLength: 1 },
  },
} as const;

const sortBodySchema = {
  type: 'object',
  required: ['targetIndex'],
  additionalProperties: false,
  properties: { targetIndex: { type: 'integer', minimum: 0 } },
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
  readonly calendarName?: string | null;
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

// ---- 檢視內容組裝（/:id/issues） ----

/** 標題欄位名稱，對齊 workspace.ts 目前的種子欄位命名（小寫 title，非 spec 標準大寫名）。 */
const FIELD_TITLE = 'title';
/**
 * spec 標準欄位名稱。MVP workspace 種子尚未提供 StartTime（見 workspace.ts 註解：
 * StartTime/EndTime 簡化成單一 due 欄位），查得到值前 computeIssueDuration 恆回
 * hasDuration: false，這是已知、非本端點造成的限制。
 */
const FIELD_START_TIME = 'StartTime';
const FIELD_END_TIME = 'EndTime';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asIsoDateOrNull(value: unknown): IsoDate | null {
  return typeof value === 'string' ? value : null;
}

/**
 * 展開檢視的 sourceMgmtIds 成主題單全集：逐一取該 Mgmt 的主題單位置工單集
 * （`Mgmts.containerIssueSetId`），收集其下工單。查無的 Mgmt id 略過不擲錯——
 * 資料來源設定當下有效、事後 Mgmt 被刪不影響既有檢視繼續運作。
 */
async function collectContainerIssues(
  pool: Pool,
  companyId: string,
  mgmtIds: readonly string[],
): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const mgmtId of mgmtIds) {
    const mgmt = await containerRepo.getMgmt(companyId, mgmtId, pool);
    if (mgmt === undefined) continue;
    const found = await issueRepo.listIssuesByIssueSet(companyId, mgmt.containerIssueSetId, pool);
    issues.push(...found);
  }
  return issues;
}

/** 逐張工單查欄位單值，組成 applyViewFilter 的候選投影。 */
async function buildFilterCandidates(
  pool: Pool,
  companyId: string,
  issues: readonly Issue[],
): Promise<IssueFilterCandidate[]> {
  const candidates: IssueFilterCandidate[] = [];
  for (const issue of issues) {
    const values = await issueRepo.listFieldValues(companyId, issue.id, pool);
    const fields: Record<string, unknown> = {};
    for (const value of values) {
      fields[value.fieldName] = value.value;
    }
    candidates.push({ issueId: issue.id, fields });
  }
  return candidates;
}

/**
 * 把 Views.filterConfig（DB 存的未驗證 JSON）窄化成 FilterConfig。
 * fail-open：整體格式不符當無篩選條件；單一 condition 格式不符時跳過該條、
 * 其餘照常套用，不因一條寫壞就讓整張檢視的篩選失效。
 */
function parseFilterConfig(raw: unknown): FilterConfig | null {
  if (raw === null || typeof raw !== 'object') return null;
  const conditions = (raw as { conditions?: unknown }).conditions;
  if (!Array.isArray(conditions)) return null;

  const parsed = conditions.flatMap((item: unknown) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { fieldName?: unknown }).fieldName === 'string' &&
      (item as { operator?: unknown }).operator === 'equals' &&
      'value' in item
    ) {
      const condition = item as { fieldName: string; operator: 'equals'; value: unknown };
      return [{ fieldName: condition.fieldName, operator: 'equals' as const, value: condition.value }];
    }
    return [];
  });

  return { conditions: parsed };
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
      if (request.body.calendarName !== undefined) {
        await viewRepo.updateViewCalendarName(pool, companyId, id, request.body.calendarName);
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

  // ---- 手動排序 ----

  // 一張檢視的已排序項，依排序值升冪；無列的工單屬該檢視的未排序區。查無檢視回 404。
  app.get<{ Params: { id: string } }>(
    '/:id/sort',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const view = await viewRepo.getView(pool, companyId, request.params.id);
      if (view === undefined) {
        return sendError(reply, 404, 'VIEW_NOT_FOUND', '檢視不存在');
      }
      const entries = await viewRepo.listSortEntries(pool, companyId, request.params.id);
      return reply.status(200).send({ entries });
    },
  );

  // 指派工單於檢視的排序位置，對應 spec ViewLogic / assignSortPosition。
  //
  // targetIndex 是「把目標自己移出後」的插入位置，移入未排序區與既有重排走同一條路徑。
  // 讀現有排序、算值、寫入同在一個交易內，避免兩人同時拖曳時互相覆蓋。
  // 回傳更新後的完整排序清單，前端不必再打一次 GET。
  app.put<{ Params: { id: string; issueId: string }; Body: { targetIndex: number } }>(
    '/:id/sort/:issueId',
    { schema: { params: sortParamsSchema, body: sortBodySchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const { id, issueId } = request.params;

      const view = await viewRepo.getView(pool, companyId, id);
      if (view === undefined) {
        return sendError(reply, 404, 'VIEW_NOT_FOUND', '檢視不存在');
      }
      const issue = await issueRepo.getIssue(companyId, issueId, pool);
      if (issue === undefined) {
        return sendError(reply, 404, 'ISSUE_NOT_FOUND', '工單不存在');
      }

      try {
        const entries = await withTransaction(async (tx) => {
          const current = await viewRepo.listSortEntries(tx, companyId, id);
          const sortValue = assignSortPosition(current, issueId, request.body.targetIndex);
          await viewRepo.upsertSortEntry(tx, {
            id: randomUUID(),
            companyId,
            viewId: id,
            issueId,
            sortValue,
          });
          return viewRepo.listSortEntries(tx, companyId, id);
        }, pool);
        return reply.status(200).send({ entries });
      } catch (error: unknown) {
        if (error instanceof SortPositionError) {
          // 位置越界屬請求本身不合法；精度耗盡是該檢視的狀態需重鋪，非本次請求的錯。
          const status = error.code === 'SORT_INDEX_OUT_OF_RANGE' ? 400 : 409;
          return sendError(reply, status, error.code, error.message);
        }
        throw error;
      }
    },
  );

  // ---- 檢視內容 ----

  /** 檢視內容的一列：id 供互動、key／title／duration 供呈現。 */
  interface ViewIssueRow {
    readonly id: string;
    readonly key: string;
    readonly title: string;
    readonly duration: IssueDuration;
  }

  // 檢視資料來源展開、套用篩選、已排序/未排序分區、日曆與工期計算。
  // 回傳結果未經 filterViewByPermission 過濾（權限過濾屬 permission_system，不在這輪範圍）。查無檢視回 404。
  app.get<{ Params: { id: string } }>(
    '/:id/issues',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      const view = await viewRepo.getView(pool, companyId, request.params.id);
      if (view === undefined) {
        return sendError(reply, 404, 'VIEW_NOT_FOUND', '檢視不存在');
      }

      const containerIssues = await collectContainerIssues(pool, companyId, view.sourceMgmtIds);
      const candidates = await buildFilterCandidates(pool, companyId, containerIssues);
      const { included, excludedIds } = applyViewFilter(candidates, parseFilterConfig(view.filterConfig));

      const sortEntries = await viewRepo.listSortEntries(pool, companyId, view.id);
      const { sortedIds, unsortedIds } = admitNewContainerIssue(
        included.map((candidate) => candidate.issueId),
        sortEntries,
      );

      const account = await permissionRepo.getAccount(pool, companyId, accountId);
      const calendarName = resolveViewCalendar(view, {
        defaultCalendarName: account?.defaultCalendarName ?? null,
      });
      const calendar =
        calendarName === null
          ? null
          : ((await calendarRepo.getCalendar(pool, companyId, calendarName)) ?? null);

      const candidateById = new Map(included.map((candidate) => [candidate.issueId, candidate]));
      const issueById = new Map(containerIssues.map((issue) => [issue.id, issue]));

      const toRow = (issueId: string): ViewIssueRow => {
        const fields = candidateById.get(issueId)?.fields ?? {};
        return {
          id: issueId,
          key: issueById.get(issueId)?.issueKey ?? '',
          title: asString(fields[FIELD_TITLE]),
          duration: computeIssueDuration(
            asIsoDateOrNull(fields[FIELD_START_TIME]),
            asIsoDateOrNull(fields[FIELD_END_TIME]),
            calendar,
          ),
        };
      };

      return reply.status(200).send({
        sortedIssues: sortedIds.map(toRow),
        unsortedIssues: unsortedIds.map(toRow),
        calendarName,
        excludedCount: excludedIds.length,
      });
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
