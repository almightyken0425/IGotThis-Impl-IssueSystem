// 工作區 API · /api/workspace 之下的啟動、加值工單列與看板欄
//
// 三個畫面的資料來源。啟動點冪等，登入後首呼即拿到工單集與流程狀態。

import { apiFetch } from './client';
import type {
  CreateIssueInput,
  IssueCreationOptions,
  UpdateIssueInput,
  WorkspaceContext,
  WorkspaceIssue,
} from './types';

/** 啟動工作區並取脈絡（工單集、型別、流程狀態）；冪等。 */
export async function getWorkspace(): Promise<WorkspaceContext> {
  return apiFetch<WorkspaceContext>('/api/workspace');
}

export function getCreationOptions(viewId: string): Promise<IssueCreationOptions> {
  return apiFetch(`/api/workspace/creation-options?viewId=${encodeURIComponent(viewId)}`);
}

/** 列出工作區工單集下的加值工單列。 */
export async function listIssues(): Promise<readonly WorkspaceIssue[]> {
  const res = await apiFetch<{ issues: readonly WorkspaceIssue[] }>('/api/workspace/issues');
  return res.issues;
}

/** 建立工單並回加值列。 */
export async function createIssue(input: CreateIssueInput): Promise<WorkspaceIssue> {
  const res = await apiFetch<{ issue: WorkspaceIssue }>('/api/workspace/issues', {
    method: 'POST',
    body: input,
  });
  return res.issue;
}

/** 更新工單欄位並回加值列。看板拖曳改狀態走此。 */
export async function updateIssue(
  issueId: string,
  input: UpdateIssueInput,
): Promise<WorkspaceIssue> {
  const res = await apiFetch<{ issue: WorkspaceIssue }>(`/api/workspace/issues/${issueId}`, {
    method: 'PATCH',
    body: input,
  });
  return res.issue;
}

/** 看板欄集合與欄序，由本 Company 各工單型別的流程狀態併出。回欄名序列。 */
export async function getKanbanColumns(): Promise<readonly string[]> {
  const res = await apiFetch<{ columns: readonly { name: string }[] }>(
    '/api/views/kanban-columns',
  );
  return res.columns.map((c) => c.name);
}
