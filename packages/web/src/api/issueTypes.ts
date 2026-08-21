// 工單型別 API · /api/issue-types 之下的工單型別讀寫
//
// 供 TypeDefinitionScreen 的「工單型別」分頁使用。

import { apiFetch } from './client';
import type { IssueTypeDefinition } from './types';

export interface CreateIssueTypeInput {
  readonly name: string;
  readonly label: string;
  readonly fieldSets: readonly string[];
}

/** 建立工單型別；名稱在 Company 內唯一，後端一併帶入預設流程定義。 */
export async function createIssueType(input: CreateIssueTypeInput): Promise<IssueTypeDefinition> {
  const res = await apiFetch<{ issueType: IssueTypeDefinition }>('/api/issue-types', {
    method: 'POST',
    body: input,
  });
  return res.issueType;
}

/** 列出本 Company 的工單型別，依名稱排序。 */
export async function listIssueTypes(): Promise<readonly IssueTypeDefinition[]> {
  const res = await apiFetch<{ issueTypes: readonly IssueTypeDefinition[] }>('/api/issue-types');
  return res.issueTypes;
}

export interface UpdateIssueTypeInput {
  readonly label: string;
  readonly fieldSets: readonly string[];
}

/** 改工單型別的顯示名稱與欄位組配方；識別名稱與系統旗標不動。 */
export async function updateIssueType(
  id: string,
  input: UpdateIssueTypeInput,
): Promise<IssueTypeDefinition> {
  const res = await apiFetch<{ issueType: IssueTypeDefinition }>(
    `/api/issue-types/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: input },
  );
  return res.issueType;
}
