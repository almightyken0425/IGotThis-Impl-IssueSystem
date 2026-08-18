// 關聯 API · /api/relations 之下的唯讀查詢
//
// 供工單詳情頁的關聯區使用：型別定義（含 symmetric／name）與正反查兩端。
// 關聯的建立與移除不在此輪範圍內，不封裝——本畫面關聯區唯讀。

import { apiFetch } from './client';
import type { IssueRelation, RelationTypeDefinition } from './types';

/** 列出本 Company 的關聯型別定義，依名稱排序。 */
export async function listRelationTypes(): Promise<readonly RelationTypeDefinition[]> {
  const res = await apiFetch<{ relationTypes: readonly RelationTypeDefinition[] }>(
    '/api/relations/types',
  );
  return res.relationTypes;
}

/** 正查：以持有端取其持有的關聯。 */
export async function listRelationsFrom(issueId: string): Promise<readonly IssueRelation[]> {
  const res = await apiFetch<{ relations: readonly IssueRelation[] }>(
    `/api/relations/edges/from/${issueId}`,
  );
  return res.relations;
}

/** 反查：以被指端取指向它的關聯。 */
export async function listRelationsTo(issueId: string): Promise<readonly IssueRelation[]> {
  const res = await apiFetch<{ relations: readonly IssueRelation[] }>(
    `/api/relations/edges/to/${issueId}`,
  );
  return res.relations;
}
