import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import { withTransaction } from '../../db/client.js';
import { containerRepo, fieldRepo, issueRepo } from '../../db/repositories/index.js';
import type {
  Company,
  FieldDef,
  IssueSet,
  IssueTypeDefinition,
  ResolutionOptionInput,
  WorkflowTransitionInput,
} from '../../db/repositories/index.js';
import type { Executor } from '../../db/repositories/index.js';
import { changeIssueStatus, formatIssueKey, invalid, recordFieldChange } from '../../domain/index.js';
import type {
  FieldChangeInput,
  StatusTransitionFailureCode,
  ValidationFailure,
} from '../../domain/index.js';
import { isUniqueViolation, sendError, sendValidationFailure } from '../errors.js';

// 前端工作區路由：/api/workspace 之下的預設工作區啟動與加值工單列表。
//
// 存在理由：泛用 REST 路由（containers / issues / fields）把工單型別、欄位定義、
// 流程狀態當作各自獨立資源，前端要開一張可用的工單得先串起七八個建立呼叫。
// 本路由把「單一 Company 模式下的預設工作區」收斂成一個冪等啟動點：
//   - 種一個內建工單型別 task 與其流程狀態
//   - 種內建欄位組「基本」與 title / status / assignee / point / due 欄位定義
//   - 種一組預設 Team > Product > Mgmt + 初始工單集（KEY = IGT）
// 並提供以「工單 + 欄位單值」摺疊而成的加值列，讓三個畫面直接消費。
//
// 邊界：本層只做協定轉換與啟動編排，落庫仍走既有 repository；泛用路由與其測試不動。
// 租戶範圍：全路由掛 requireAuth，讀寫一律帶 identity.companyId。

export interface WorkspaceRoutesOptions {
  readonly pool: Pool;
  readonly requireAuth: preHandlerHookHandler;
}

// ---- 預設工作區的固定命名 ----

const DEFAULT_ISSUE_TYPE_NAME = 'task';
const DEFAULT_ISSUE_TYPE_LABEL = '工單';
const DEFAULT_FIELD_SET = '基本';
const DEFAULT_ISSUE_SET_KEY = 'IGT';

const DEFAULT_TEAM_NAME = '預設團隊';
const DEFAULT_PRODUCT_NAME = '預設產品';
const DEFAULT_MGMT_NAME = '預設管理域';
const DEFAULT_ISSUE_SET_NAME = '預設工單集';

/** 加值列消費的欄位。名稱即工單欄位單值的 field_name，畫面依此摺疊。 */
const FIELD_TITLE = 'title';
const FIELD_STATUS = 'status';
const FIELD_ASSIGNEE = 'assignee';
const FIELD_POINT = 'point';
const FIELD_DUE = 'due';
const FIELD_RESOLUTION = 'resolution';

/** 流程狀態：順序即 sortOrder，第一個為初始、最後一個為終止。 */
const DEFAULT_STATES = ['待處理', '處理中', '審查中', '已完成'] as const;
const DEFAULT_STATUS = DEFAULT_STATES[0];

/**
 * 預設流程轉換：待處理→處理中→審查中→已完成的正向鏈，加審查中→處理中的退回路徑。
 * 沒有退回路徑，審查不過的工單會卡死無路可走。不開放其他跳躍——待處理直接到
 * 已完成正是要拆掉的舊行為。四條轉換皆不限角色、無額外必填欄位，不預先發明
 * 沒人要求的限制；終止狀態須提供結案原因由 validateStatusTransition 統一把關。
 */
const DEFAULT_TRANSITIONS: readonly WorkflowTransitionInput[] = [
  { fromState: '待處理', toState: '處理中', requiredRole: null, requiredFields: [] },
  { fromState: '處理中', toState: '審查中', requiredRole: null, requiredFields: [] },
  { fromState: '審查中', toState: '已完成', requiredRole: null, requiredFields: [] },
  { fromState: '審查中', toState: '處理中', requiredRole: null, requiredFields: [] },
];

/** 沿用 spec 標準結案原因（no7_issue_model.md 的 StandardResolutionOptions）。 */
const DEFAULT_RESOLUTIONS: readonly string[] = ['已完成', '不做'];

interface FieldSeed {
  readonly name: string;
  readonly label: string;
  readonly valueType: string;
  readonly tracked: boolean;
}

/**
 * 追蹤旗標依 spec no1_data_models/no3_field_model.md 的 StandardFieldCatalog：
 * Status／Assignee／StoryPoint 表列「開」，精確命中；due 對應表列「開」的
 * EndTime（MVP 把 StartTime/EndTime 簡化成單一 due 欄位，屬類比非精確同名）；
 * title／resolution 表列「-」，維持不追蹤。
 */
const FIELD_SEEDS: readonly FieldSeed[] = [
  { name: FIELD_TITLE, label: '標題', valueType: 'text', tracked: false },
  { name: FIELD_STATUS, label: '狀態', valueType: 'text', tracked: true },
  { name: FIELD_ASSIGNEE, label: '負責人', valueType: 'text', tracked: true },
  { name: FIELD_POINT, label: '點數', valueType: 'number', tracked: true },
  { name: FIELD_DUE, label: '到期日', valueType: 'date', tracked: true },
  { name: FIELD_RESOLUTION, label: '結案原因', valueType: 'text', tracked: false },
];

// ---- 對外形狀 ----

/** 前端啟動所需的工作區脈絡。 */
interface WorkspaceContext {
  readonly company: Company;
  readonly issueSet: Pick<IssueSet, 'id' | 'name' | 'key'>;
  readonly issueType: Pick<IssueTypeDefinition, 'id' | 'name' | 'label'>;
  readonly statuses: readonly { readonly name: string; readonly isTerminal: boolean }[];
  readonly resolutionOptions: readonly { readonly value: string }[];
}

/** 工單 + 欄位單值摺疊而成的加值列，供清單 / 看板 / 開發順序表消費。 */
interface WorkspaceIssueRow {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly status: string;
  readonly assignee: string;
  readonly point: number | null;
  readonly due: string | null;
  readonly resolution: string | null;
}

// ---- 啟動編排 ----

/** 確保 task 工單型別、其欄位組與欄位定義、流程狀態皆存在，回傳型別。 */
async function ensureIssueType(
  tx: Executor,
  companyId: string,
): Promise<IssueTypeDefinition> {
  const existing = await issueRepo.getIssueTypeByName(companyId, DEFAULT_ISSUE_TYPE_NAME, tx);
  if (existing !== undefined) return existing;

  // 欄位組「基本」，工單型別的 fieldSets 配方指向它。
  const fieldSet = await fieldRepo.findFieldSet(companyId, DEFAULT_FIELD_SET, tx);
  if (fieldSet === undefined) {
    await fieldRepo.insertFieldSet({ companyId, name: DEFAULT_FIELD_SET, system: true }, tx);
  }
  for (const seed of FIELD_SEEDS) {
    const def = await fieldRepo.findFieldDef(companyId, seed.name, tx);
    if (def === undefined) {
      const fieldDef: FieldDef = {
        companyId,
        name: seed.name,
        fieldSetName: DEFAULT_FIELD_SET,
        kind: 'single',
        valueType: seed.valueType,
        system: true,
        readonly: false,
        rollupable: false,
        rollupFn: null,
        tracked: seed.tracked,
        label: seed.label,
      };
      await fieldRepo.insertFieldDef(fieldDef, tx);
    }
  }

  // ChangeLog 為系統寫入的多筆欄位，供 recordFieldChange 追加記錄；
  // issue_field_records 對 (company_id, field_name) 有外鍵指向 field_defs，
  // 沒有這筆定義，appendChangeLog 會撞外鍵失敗。
  const changeLogDef = await fieldRepo.findFieldDef(companyId, fieldRepo.CHANGE_LOG_FIELD_NAME, tx);
  if (changeLogDef === undefined) {
    await fieldRepo.insertFieldDef(
      {
        companyId,
        name: fieldRepo.CHANGE_LOG_FIELD_NAME,
        fieldSetName: DEFAULT_FIELD_SET,
        kind: 'multi',
        valueType: 'text',
        system: true,
        readonly: true,
        rollupable: false,
        rollupFn: null,
        tracked: false,
        label: '變更歷史',
      },
      tx,
    );
  }

  const issueType = await issueRepo.createIssueType(
    {
      id: randomUUID(),
      companyId,
      name: DEFAULT_ISSUE_TYPE_NAME,
      label: DEFAULT_ISSUE_TYPE_LABEL,
      fieldSets: [DEFAULT_FIELD_SET],
      system: true,
    },
    tx,
  );

  await issueRepo.replaceWorkflowStates(
    companyId,
    issueType.id,
    DEFAULT_STATES.map((name, index) => ({
      name,
      sortOrder: index,
      isInitial: index === 0,
      isTerminal: index === DEFAULT_STATES.length - 1,
    })),
    tx,
  );
  await issueRepo.replaceWorkflowTransitions(companyId, issueType.id, DEFAULT_TRANSITIONS, tx);
  await issueRepo.replaceResolutionOptions(
    companyId,
    issueType.id,
    DEFAULT_RESOLUTIONS.map((value): ResolutionOptionInput => ({ value, system: true })),
    tx,
  );

  return issueType;
}

/** 確保預設容器樹存在，回傳作為工作區的工單集（優先取 KEY = IGT）。 */
async function ensureIssueSet(tx: Executor, companyId: string): Promise<IssueSet> {
  const tree = await containerRepo.getContainerTree(companyId, tx);
  const existingSets = (tree?.teams ?? [])
    .flatMap((team) => team.products)
    .flatMap((product) => product.mgmts)
    .flatMap((mgmt) => mgmt.issueSets);
  const preferred =
    existingSets.find((set) => set.key === DEFAULT_ISSUE_SET_KEY) ?? existingSets[0];
  if (preferred !== undefined) return preferred;

  // 空 Company：種一組完整的預設容器樹。
  const team = await containerRepo.createTeam(
    { id: randomUUID(), companyId, name: DEFAULT_TEAM_NAME },
    tx,
  );
  const product = await containerRepo.createProduct(
    { id: randomUUID(), companyId, teamId: team.id, name: DEFAULT_PRODUCT_NAME },
    tx,
  );
  const created = await containerRepo.createMgmtWithInitialIssueSet(
    {
      mgmt: { id: randomUUID(), companyId, productId: product.id, name: DEFAULT_MGMT_NAME },
      issueSet: {
        id: randomUUID(),
        companyId,
        name: DEFAULT_ISSUE_SET_NAME,
        key: DEFAULT_ISSUE_SET_KEY,
      },
    },
    tx,
  );
  return created.issueSet;
}

/** 冪等啟動：種齊預設工作區並回傳脈絡。並發下撞唯一約束則重讀既有狀態。 */
async function ensureWorkspace(pool: Pool, companyId: string): Promise<WorkspaceContext> {
  const company = await containerRepo.getCompany(companyId, pool);
  if (company === undefined) {
    throw new Error('當前身分的 Company 不存在');
  }

  let issueType: IssueTypeDefinition;
  let issueSet: IssueSet;
  try {
    ({ issueType, issueSet } = await withTransaction(async (tx) => {
      const type = await ensureIssueType(tx, companyId);
      const set = await ensureIssueSet(tx, companyId);
      return { issueType: type, issueSet: set };
    }, pool));
  } catch (error: unknown) {
    // 並發啟動：另一請求已搶先種好，撞唯一約束後重讀既有狀態即可。
    if (!isUniqueViolation(error)) throw error;
    const type = await issueRepo.getIssueTypeByName(companyId, DEFAULT_ISSUE_TYPE_NAME, pool);
    const set = await ensureIssueSet(pool, companyId);
    if (type === undefined) throw error;
    issueType = type;
    issueSet = set;
  }

  const states = await issueRepo.listWorkflowStates(companyId, issueType.id, pool);
  const resolutionOptions = await issueRepo.listResolutionOptions(companyId, issueType.id, pool);
  return {
    company,
    issueSet: { id: issueSet.id, name: issueSet.name, key: issueSet.key },
    issueType: { id: issueType.id, name: issueType.name, label: issueType.label },
    statuses: states.map((s) => ({ name: s.name, isTerminal: s.isTerminal })),
    resolutionOptions: resolutionOptions.map((r) => ({ value: r.value })),
  };
}

// ---- 加值列摺疊 ----

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 欄位是否算「已有值」，供 requiredFields 檢查與加值列摺疊共用。 */
function hasFieldValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

/** 把單張工單與其欄位單值摺疊成加值列。 */
async function foldIssueRow(
  pool: Pool,
  companyId: string,
  issue: { id: string; issueKey: string },
): Promise<WorkspaceIssueRow> {
  const values = await issueRepo.listFieldValues(companyId, issue.id, pool);
  const byName = new Map(values.map((v) => [v.fieldName, v.value]));
  const pointRaw = byName.get(FIELD_POINT);
  const dueRaw = byName.get(FIELD_DUE);
  const resolutionRaw = byName.get(FIELD_RESOLUTION);
  return {
    id: issue.id,
    key: issue.issueKey,
    title: asString(byName.get(FIELD_TITLE)),
    status: asString(byName.get(FIELD_STATUS)) || DEFAULT_STATUS,
    assignee: asString(byName.get(FIELD_ASSIGNEE)),
    point: typeof pointRaw === 'number' ? pointRaw : null,
    due: typeof dueRaw === 'string' && dueRaw !== '' ? dueRaw : null,
    resolution: typeof resolutionRaw === 'string' && resolutionRaw !== '' ? resolutionRaw : null,
  };
}

// ---- 輸入 schema ----

const createIssueBodySchema = {
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    status: { type: 'string', minLength: 1, maxLength: 100 },
    assignee: { type: 'string', maxLength: 100 },
    point: { type: 'number' },
    due: { type: 'string', maxLength: 40 },
  },
} as const;

const updateIssueBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    status: { type: 'string', minLength: 1, maxLength: 100 },
    resolution: { type: 'string', minLength: 1, maxLength: 200 },
    assignee: { type: 'string', maxLength: 100 },
    point: { type: ['number', 'null'] },
    due: { type: ['string', 'null'], maxLength: 40 },
  },
} as const;

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const issueIdParams = {
  type: 'object',
  required: ['issueId'],
  additionalProperties: false,
  properties: { issueId: { type: 'string', pattern: UUID_PATTERN } },
} as const;

interface CreateIssueBody {
  readonly title: string;
  readonly status?: string;
  readonly assignee?: string;
  readonly point?: number;
  readonly due?: string;
}

interface UpdateIssueBody {
  readonly title?: string;
  readonly status?: string;
  readonly resolution?: string;
  readonly assignee?: string;
  readonly point?: number | null;
  readonly due?: string | null;
}

// ---- 路由 ----

export const workspaceRoutes: FastifyPluginAsync<WorkspaceRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, requireAuth } = opts;

  app.addHook('preHandler', requireAuth);

  // 啟動工作區並回脈絡；冪等，前端登入後首呼即可拿到工單集與型別。
  app.get('/', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const context = await ensureWorkspace(pool, companyId);
    return reply.status(200).send(context);
  });

  // 加值工單列：工作區工單集下的工單摺疊欄位單值。
  app.get('/issues', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const context = await ensureWorkspace(pool, companyId);
    const issues = await issueRepo.listIssuesByIssueSet(companyId, context.issueSet.id, pool);
    const rows: WorkspaceIssueRow[] = [];
    for (const issue of issues) {
      rows.push(await foldIssueRow(pool, companyId, issue));
    }
    return reply.status(200).send({ issues: rows });
  });

  // 建立工單：取號落庫 + 寫入 title / status / 其餘欄位，回傳加值列。
  app.post<{ Body: CreateIssueBody }>(
    '/issues',
    { schema: { body: createIssueBodySchema } },
    async (request, reply) => {
      const { accountId, companyId } = currentIdentity(request);
      const context = await ensureWorkspace(pool, companyId);
      const body = request.body;

      const issue = await withTransaction(async (tx) => {
        const now = Date.now();
        const seq = await containerRepo.takeNextSeq(companyId, context.issueSet.id, tx);
        const issueKey = formatIssueKey(context.issueSet.key, seq!);
        const created = await issueRepo.createIssue(
          {
            id: randomUUID(),
            companyId,
            issueSetId: context.issueSet.id,
            issueTypeId: context.issueType.id,
            issueKey,
          },
          tx,
        );
        // 新建工單所有欄位都是從無到有；oldValue 一律 null，與 PATCH 走同一套
        // recordFieldChange，不必為建立特判成另一個函式。
        const changes: FieldChangeInput[] = [];
        const setField = (name: string, value: unknown): Promise<unknown> => {
          changes.push({ fieldName: name, oldValue: null, newValue: value });
          return issueRepo.setFieldValue({ companyId, issueId: created.id, fieldName: name, value }, tx);
        };
        await setField(FIELD_TITLE, body.title);
        await setField(FIELD_STATUS, body.status ?? DEFAULT_STATUS);
        if (body.assignee !== undefined && body.assignee !== '') {
          await setField(FIELD_ASSIGNEE, body.assignee);
        }
        if (body.point !== undefined) await setField(FIELD_POINT, body.point);
        if (body.due !== undefined && body.due !== '') await setField(FIELD_DUE, body.due);

        const fieldDefs = await fieldRepo.listFieldDefs(companyId, tx);
        const entries = recordFieldChange({ changes, actor: accountId, now, fieldDefs });
        for (const entry of entries) {
          await fieldRepo.appendChangeLog(
            { id: randomUUID(), companyId, issueId: created.id, entry, authorId: accountId, createdOn: now },
            tx,
          );
        }
        return created;
      }, pool);

      const row = await foldIssueRow(pool, companyId, issue);
      return reply.status(201).send({ issue: row });
    },
  );

  // 更新工單欄位：帶到的欄位就寫、null 清除、未帶不動，回傳加值列。看板拖曳改狀態走此。
  //
  // status 有變動時走 changeIssueStatus 驗證：不合法轉換、角色不符、缺必填欄位、
  // 終止狀態缺結案原因、結案原因不合法皆回 422。resolution 只能隨一次真正的
  // status 轉換一併提供，單獨送視為請求不合法。狀態值與現況相同視為 no-op，
  // 不觸發驗證，讓整包送回的編輯流程不會平白被要求補結案原因。
  app.patch<{ Params: { issueId: string }; Body: UpdateIssueBody }>(
    '/issues/:issueId',
    { schema: { params: issueIdParams, body: updateIssueBodySchema } },
    async (request, reply) => {
      const { accountId, companyId } = currentIdentity(request);
      const { issueId } = request.params;
      const body = request.body;

      const issue = await issueRepo.getIssue(companyId, issueId, pool);
      if (issue === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', '工單不存在');
      }

      type UpdateOutcome =
        | ValidationFailure<StatusTransitionFailureCode | 'RESOLUTION_REQUIRES_STATUS_CHANGE'>
        | { readonly ok: true };

      const outcome = await withTransaction<UpdateOutcome>(async (tx) => {
        const now = Date.now();
        const fieldValues = await issueRepo.listFieldValues(companyId, issueId, tx);
        const byName = new Map(fieldValues.map((v) => [v.fieldName, v.value]));

        const changes: FieldChangeInput[] = [];
        const write = (name: string, value: unknown): Promise<unknown> => {
          changes.push({ fieldName: name, oldValue: byName.get(name) ?? null, newValue: value });
          return issueRepo.setFieldValue({ companyId, issueId, fieldName: name, value }, tx);
        };
        const clear = (name: string): Promise<unknown> => {
          changes.push({ fieldName: name, oldValue: byName.get(name) ?? null, newValue: null });
          return issueRepo.deleteFieldValue(companyId, issueId, name, tx);
        };

        const currentStatus = asString(byName.get(FIELD_STATUS)) || DEFAULT_STATUS;
        const statusChanging = body.status !== undefined && body.status !== currentStatus;

        if (body.resolution !== undefined && !statusChanging) {
          return invalid(
            'RESOLUTION_REQUIRES_STATUS_CHANGE',
            'resolution 只能隨 status 轉換一併提供',
          );
        }

        if (statusChanging) {
          const targetStatus = body.status as string;
          const [states, transitions, resolutionOptions] = await Promise.all([
            issueRepo.listWorkflowStates(companyId, issue.issueTypeId, tx),
            issueRepo.listWorkflowTransitions(companyId, issue.issueTypeId, tx),
            issueRepo.listResolutionOptions(companyId, issue.issueTypeId, tx),
          ]);
          const fieldsWithValue = [...byName.entries()]
            .filter(([, value]) => hasFieldValue(value))
            .map(([name]) => name);

          const result = changeIssueStatus({
            definition: {
              states: states.map((s) => ({ name: s.name, isTerminal: s.isTerminal })),
              transitions: transitions.map((t) => ({
                fromState: t.fromState,
                toState: t.toState,
                requiredRole: t.requiredRole,
                requiredFields: t.requiredFields,
              })),
              resolutionOptions: resolutionOptions.map((r) => ({ value: r.value })),
            },
            issue: { currentStatus, fieldsWithValue },
            targetStatus,
            actor: { roleNames: [] },
            resolution: body.resolution ?? null,
          });
          if (!result.ok) {
            return result;
          }
          await write(FIELD_STATUS, result.status);
          if (result.resolution !== undefined) {
            await write(FIELD_RESOLUTION, result.resolution);
          }
        }

        if (body.title !== undefined) await write(FIELD_TITLE, body.title);
        if (body.assignee !== undefined) {
          await (body.assignee === '' ? clear(FIELD_ASSIGNEE) : write(FIELD_ASSIGNEE, body.assignee));
        }
        if (body.point !== undefined) {
          await (body.point === null ? clear(FIELD_POINT) : write(FIELD_POINT, body.point));
        }
        if (body.due !== undefined) {
          await (body.due === null || body.due === '' ? clear(FIELD_DUE) : write(FIELD_DUE, body.due));
        }

        const fieldDefs = await fieldRepo.listFieldDefs(companyId, tx);
        const entries = recordFieldChange({ changes, actor: accountId, now, fieldDefs });
        for (const entry of entries) {
          await fieldRepo.appendChangeLog(
            { id: randomUUID(), companyId, issueId, entry, authorId: accountId, createdOn: now },
            tx,
          );
        }
        return { ok: true };
      }, pool);

      if (!outcome.ok) {
        return sendValidationFailure(reply, outcome);
      }

      const row = await foldIssueRow(pool, companyId, issue);
      return reply.status(200).send({ issue: row });
    },
  );
};
