// 關聯 repository：關聯型別定義與工單關聯的讀寫，及工單關聯的正查與反查。
//
// 角色：domain 純函式與 PostgreSQL 之間的橋。
// - row（snake_case）轉 domain 型別（camelCase）由本檔的 mapper 承擔
// - 實體型別引用 domain/relation 既有定義（RelationTypeDefinition、IssueRelation），不另立
// - 寫入前呼叫 domain 的完整性檢查：
//     - 寫關聯型別定義前跑開關組合檢查（validateRelationTypeDefinition）
//     - 建工單關聯前跑獨佔、禁環、母子邊界總檢查（validateRelationCreation）
// - 獨佔約束的最終保證在 schema 的部分唯一索引（uq_issue_relations_exclusive）；
//   domain 檢查是友善前置，索引是併發下的硬底線，兩者並存
// - 全查詢帶 company_id 租戶鍵過濾，跨租戶資料互不可見

import {
  validateRelationCreation,
  validateRelationTypeDefinition,
} from '../../domain/index.js';
import type {
  IssueLocation,
  IssueRelation,
  RelationCandidate,
  RelationCreationFailureCode,
  RelationTypeDefinition,
} from '../../domain/index.js';
import type { Executor } from './executor.js';
import { getPool } from '../pool.js';
import { run, runOne } from './executor.js';

// ============================================================
// row 型別與 mapper
// ============================================================

interface RelationTypeRow {
  id: string;
  company_id: string;
  name: string;
  exclusive: boolean;
  acyclic: boolean;
  ordered: boolean;
  symmetric: boolean;
  rollup: boolean;
  system: boolean;
  created_on: string; // bigint 由 driver 回傳為字串
  updated_on: string;
}

interface IssueRelationRow {
  id: string;
  company_id: string;
  from_issue_id: string;
  to_issue_id: string;
  relation_type_id: string;
  ordinal: number;
  exclusive: boolean;
  created_on: string;
  updated_on: string;
}

function toRelationTypeDefinition(row: RelationTypeRow): RelationTypeDefinition {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    exclusive: row.exclusive,
    acyclic: row.acyclic,
    ordered: row.ordered,
    symmetric: row.symmetric,
    rollup: row.rollup,
    system: row.system,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

function toIssueRelation(row: IssueRelationRow): IssueRelation {
  return {
    id: row.id,
    companyId: row.company_id,
    fromIssueId: row.from_issue_id,
    toIssueId: row.to_issue_id,
    relationTypeId: row.relation_type_id,
    ordinal: row.ordinal,
    exclusive: row.exclusive,
    createdOn: Number(row.created_on),
    updatedOn: Number(row.updated_on),
  };
}

// ============================================================
// repository 錯誤
// ============================================================

export type RelationRepoErrorCode =
  /** 寫關聯型別時開關組合非法（對稱與獨佔並存、彙總缺前提等）。 */
  | 'invalid_relation_type_switches'
  /** 建關聯時引用的關聯型別在該 Company 不存在。 */
  | 'relation_type_not_found';

/** repository 層的前置條件違反；屬呼叫端錯誤，故擲出而非回傳結果。 */
export class RelationRepoError extends Error {
  constructor(
    readonly code: RelationRepoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RelationRepoError';
  }
}

// ============================================================
// 關聯型別定義：讀寫
// ============================================================

/**
 * 寫入一筆關聯型別定義。
 *
 * 寫入前跑 domain 的開關組合檢查；非法組合擲 RelationRepoError，不落地。
 * `symmetric` 為 SQL 保留字，識別碼加引號。
 */
export async function insertRelationType(
  def: RelationTypeDefinition,
  exec: Executor = getPool(),
): Promise<RelationTypeDefinition> {
  const check = validateRelationTypeDefinition(def);
  if (!check.ok) {
    throw new RelationRepoError('invalid_relation_type_switches', check.reason);
  }

  const rows = await run<RelationTypeRow>(
    exec,
    `INSERT INTO relation_type_definitions
       (id, company_id, name, exclusive, acyclic, ordered, "symmetric", rollup, system, created_on, updated_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      def.id,
      def.companyId,
      def.name,
      def.exclusive,
      def.acyclic,
      def.ordered,
      def.symmetric,
      def.rollup,
      def.system,
      def.createdOn,
      def.updatedOn,
    ],
  );
  return toRelationTypeDefinition(rows[0]!);
}

/** 依 id 查關聯型別定義，限同 Company。 */
export async function findRelationTypeById(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<RelationTypeDefinition | undefined> {
  const row = await runOne<RelationTypeRow>(
    exec,
    'SELECT * FROM relation_type_definitions WHERE company_id = $1 AND id = $2',
    [companyId, id],
  );
  return row ? toRelationTypeDefinition(row) : undefined;
}

/** 依識別名稱查關聯型別定義，限同 Company（名稱在 Company 內唯一）。 */
export async function findRelationTypeByName(
  companyId: string,
  name: string,
  exec: Executor = getPool(),
): Promise<RelationTypeDefinition | undefined> {
  const row = await runOne<RelationTypeRow>(
    exec,
    'SELECT * FROM relation_type_definitions WHERE company_id = $1 AND name = $2',
    [companyId, name],
  );
  return row ? toRelationTypeDefinition(row) : undefined;
}

/** 列出某 Company 的所有關聯型別定義，依名稱排序。 */
export async function listRelationTypes(
  companyId: string,
  exec: Executor = getPool(),
): Promise<RelationTypeDefinition[]> {
  const rows = await run<RelationTypeRow>(
    exec,
    'SELECT * FROM relation_type_definitions WHERE company_id = $1 ORDER BY name',
    [companyId],
  );
  return rows.map(toRelationTypeDefinition);
}

// ============================================================
// 工單關聯：建立、正查、反查
// ============================================================

/** 建立工單關聯的輸入；`exclusive` 為複製欄，由本層自關聯型別定義複製，不由呼叫端給。 */
export interface CreateRelationInput {
  readonly id: string;
  readonly companyId: string;
  readonly fromIssueId: string;
  readonly toIssueId: string;
  readonly relationTypeId: string;
  /** 序位；型別非有序時呼叫端應給 0，預設 0。 */
  readonly ordinal?: number;
  readonly createdOn: number;
  readonly updatedOn: number;
}

/** 建立工單關聯的結果：檢查通過落地回關聯，否則回失敗代碼供呼叫端分流。 */
export type CreateRelationResult =
  | { readonly ok: true; readonly relation: IssueRelation }
  | { readonly ok: false; readonly code: RelationCreationFailureCode; readonly reason: string };

/** 同型別現存關聯投影，供 domain 的獨佔與禁環檢查用。 */
async function loadRelationCandidates(
  companyId: string,
  relationTypeId: string,
  exec: Executor,
): Promise<RelationCandidate[]> {
  const rows = await run<Pick<IssueRelationRow, 'from_issue_id' | 'to_issue_id' | 'relation_type_id'>>(
    exec,
    `SELECT from_issue_id, to_issue_id, relation_type_id
     FROM issue_relations
     WHERE company_id = $1 AND relation_type_id = $2`,
    [companyId, relationTypeId],
  );
  return rows.map((row) => ({
    fromIssueId: row.from_issue_id,
    toIssueId: row.to_issue_id,
    relationTypeId: row.relation_type_id,
  }));
}

/** 兩端工單的所屬工單集投影，供 domain 的母子邊界檢查用。 */
async function loadIssueLocations(
  companyId: string,
  issueIds: readonly string[],
  exec: Executor,
): Promise<IssueLocation[]> {
  const rows = await run<{ id: string; issue_set_id: string }>(
    exec,
    'SELECT id, issue_set_id FROM issues WHERE company_id = $1 AND id = ANY($2)',
    [companyId, issueIds],
  );
  return rows.map((row) => ({ id: row.id, issueSetId: row.issue_set_id }));
}

/**
 * 建立工單關聯。
 *
 * 流程：載入關聯型別 → 載入同型別現存關聯與兩端工單位置 →
 * 跑 domain 的 validateRelationCreation（獨佔、禁環、母子邊界）→ 通過才落地。
 * `exclusive` 恆自關聯型別定義複製，讓 schema 的獨佔部分唯一索引靜態成立；
 * 併發下即使 domain 檢查漏接，該索引仍是硬底線。
 *
 * 讀後寫應在同一交易內原子完成：呼叫端傳交易 client 為 exec 即可；
 * 走預設連線池時，schema 的獨佔索引仍保證獨佔正確性。
 */
export async function createRelation(
  input: CreateRelationInput,
  exec: Executor = getPool(),
): Promise<CreateRelationResult> {
  const relationType = await findRelationTypeById(input.companyId, input.relationTypeId, exec);
  if (!relationType) {
    throw new RelationRepoError(
      'relation_type_not_found',
      `關聯型別 ${input.relationTypeId} 在 Company ${input.companyId} 不存在`,
    );
  }

  const candidate: RelationCandidate = {
    fromIssueId: input.fromIssueId,
    toIssueId: input.toIssueId,
    relationTypeId: input.relationTypeId,
  };
  const existingRelations = await loadRelationCandidates(
    input.companyId,
    input.relationTypeId,
    exec,
  );
  const issues = await loadIssueLocations(
    input.companyId,
    [input.fromIssueId, input.toIssueId],
    exec,
  );

  const check = validateRelationCreation({
    candidate,
    relationType,
    existingRelations,
    issues,
  });
  if (!check.ok) {
    return { ok: false, code: check.code, reason: check.reason };
  }

  const rows = await run<IssueRelationRow>(
    exec,
    `INSERT INTO issue_relations
       (id, company_id, from_issue_id, to_issue_id, relation_type_id, ordinal, exclusive, created_on, updated_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.id,
      input.companyId,
      input.fromIssueId,
      input.toIssueId,
      input.relationTypeId,
      input.ordinal ?? 0,
      relationType.exclusive,
      input.createdOn,
      input.updatedOn,
    ],
  );
  return { ok: true, relation: toIssueRelation(rows[0]!) };
}

/** 依 id 查工單關聯，限同 Company。 */
export async function findRelationById(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<IssueRelation | undefined> {
  const row = await runOne<IssueRelationRow>(
    exec,
    'SELECT * FROM issue_relations WHERE company_id = $1 AND id = $2',
    [companyId, id],
  );
  return row ? toIssueRelation(row) : undefined;
}

/**
 * 正查：以持有端為鍵取其持有的關聯，走正查索引（持有端、型別、序位）。
 * 給 relationTypeId 則限該型別，否則回持有端全部關聯。
 */
export async function findRelationsFromIssue(
  companyId: string,
  fromIssueId: string,
  relationTypeId: string | undefined,
  exec: Executor = getPool(),
): Promise<IssueRelation[]> {
  const rows =
    relationTypeId === undefined
      ? await run<IssueRelationRow>(
          exec,
          `SELECT * FROM issue_relations
           WHERE company_id = $1 AND from_issue_id = $2
           ORDER BY relation_type_id, ordinal`,
          [companyId, fromIssueId],
        )
      : await run<IssueRelationRow>(
          exec,
          `SELECT * FROM issue_relations
           WHERE company_id = $1 AND from_issue_id = $2 AND relation_type_id = $3
           ORDER BY ordinal`,
          [companyId, fromIssueId, relationTypeId],
        );
  return rows.map(toIssueRelation);
}

/**
 * 反查：以被指端為鍵取指向它的關聯，走反查索引（被指端、型別）。
 * 關聯只存持有端一列，後續方向與被指方向皆由此反查取得。
 * 給 relationTypeId 則限該型別，否則回指向它的全部關聯。
 */
export async function findRelationsToIssue(
  companyId: string,
  toIssueId: string,
  relationTypeId: string | undefined,
  exec: Executor = getPool(),
): Promise<IssueRelation[]> {
  const rows =
    relationTypeId === undefined
      ? await run<IssueRelationRow>(
          exec,
          `SELECT * FROM issue_relations
           WHERE company_id = $1 AND to_issue_id = $2
           ORDER BY relation_type_id, created_on`,
          [companyId, toIssueId],
        )
      : await run<IssueRelationRow>(
          exec,
          `SELECT * FROM issue_relations
           WHERE company_id = $1 AND to_issue_id = $2 AND relation_type_id = $3
           ORDER BY created_on`,
          [companyId, toIssueId, relationTypeId],
        );
  return rows.map(toIssueRelation);
}

/** 刪除一筆工單關聯，限同 Company；回傳是否真的刪到一列。 */
export async function deleteRelation(
  companyId: string,
  id: string,
  exec: Executor = getPool(),
): Promise<boolean> {
  const rows = await run<{ id: string }>(
    exec,
    'DELETE FROM issue_relations WHERE company_id = $1 AND id = $2 RETURNING id',
    [companyId, id],
  );
  return rows.length > 0;
}
