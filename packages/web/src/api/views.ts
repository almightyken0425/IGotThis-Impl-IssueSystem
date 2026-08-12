// 檢視 API · /api/views 之下的清單、建立、資料查詢
//
// 排序、篩選設定等其餘 /api/views 端點，等對應畫面（DevOrderScreen 等）
// 真的要用時再封裝。

import { apiFetch } from './client';
import type { CreateViewInput, View, WorkspaceIssue } from './types';

/** 當前帳號名下的檢視清單。 */
export async function listMyViews(): Promise<readonly View[]> {
  const res = await apiFetch<{ views: readonly View[] }>('/api/views?scope=mine');
  return res.views;
}

/** 依檢視資料來源查完整欄位工單列（title/status/assignee/point/due/resolution），
 *  供 ListScreen／KanbanScreen 使用。跟主題單視角的 /:id/issues 是不同端點。 */
export async function getWorkspaceIssues(viewId: string): Promise<readonly WorkspaceIssue[]> {
  const res = await apiFetch<{ issues: readonly WorkspaceIssue[]; excludedCount: number }>(
    `/api/views/${viewId}/workspace-issues`,
  );
  return res.issues;
}

/**
 * 建立檢視。viewType／displayLevel 由本層固定帶入（後端該兩欄必填，
 * 新增檢視表單依 spec 只填名稱與組織範圍，不另開輸入框）：
 * viewType 沿用檢視名稱（系統不解讀語意），displayLevel 給根層級 1。
 */
export async function createView(input: CreateViewInput): Promise<View> {
  const res = await apiFetch<{ view: View }>('/api/views', {
    method: 'POST',
    body: { ...input, viewType: input.name, displayLevel: 1 },
  });
  return res.view;
}
