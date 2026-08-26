// 流程定義 API · /api/issue-types/:id/workflow 之下的狀態／轉換／結案原因讀寫
//
// 供 TypeDefinitionScreen 的「流程」分頁使用。三清單整包替換，比照後端
// issueTypes.ts 的 PUT 契約：前端每次送當前完整三份，不做單筆增刪端點。

import { apiFetch } from './client';
import type { UpdateWorkflowDefinitionInput, WorkflowDefinition } from './types';

/** 讀該型別完整流程定義：狀態、轉換、結案原因三清單一次帶回。 */
export async function getWorkflowDefinition(issueTypeId: string): Promise<WorkflowDefinition> {
  return apiFetch<WorkflowDefinition>(`/api/issue-types/${encodeURIComponent(issueTypeId)}/workflow`);
}

/** 整包替換該型別的流程定義；422 代表起始狀態數量或轉換引用的狀態不合法。 */
export async function updateWorkflowDefinition(
  issueTypeId: string,
  input: UpdateWorkflowDefinitionInput,
): Promise<WorkflowDefinition> {
  return apiFetch<WorkflowDefinition>(`/api/issue-types/${encodeURIComponent(issueTypeId)}/workflow`, {
    method: 'PUT',
    body: input,
  });
}
