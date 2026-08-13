// 檢視 API · /api/views 之下的清單、建立、資料查詢

import { apiFetch } from './client';
import type {
  CreateViewInput,
  DevOrderIssuesResult,
  View,
  ViewSortEntry,
  WorkspaceIssuesResult,
} from './types';

/** 當前帳號名下的檢視清單。 */
export async function listMyViews(): Promise<readonly View[]> {
  const res = await apiFetch<{ views: readonly View[] }>('/api/views?scope=mine');
  return res.views;
}

/** 依檢視資料來源查完整欄位工單列（title/status/assignee/point/due/resolution），
 *  供 ListScreen／KanbanScreen 使用。跟主題單視角的 /:id/issues 是不同端點。 */
export async function getWorkspaceIssues(viewId: string): Promise<WorkspaceIssuesResult> {
  return apiFetch<WorkspaceIssuesResult>(`/api/views/${viewId}/workspace-issues`);
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

/** 檢視的主題單視角內容：三個顯示層級一次算好的甘特座標、時間軸、日曆名稱。供 DevOrderScreen 使用。 */
export async function getDevOrderIssues(viewId: string): Promise<DevOrderIssuesResult> {
  return apiFetch<DevOrderIssuesResult>(`/api/views/${viewId}/issues`);
}

/**
 * 指派工單於檢視的排序位置。targetIndex 是「把目標自己移出後」的插入位置
 * （assignSortPosition 的既定契約），呼叫端負責換算，本函式只轉發。
 */
export async function setSortPosition(
  viewId: string,
  issueId: string,
  targetIndex: number,
): Promise<readonly ViewSortEntry[]> {
  const res = await apiFetch<{ entries: readonly ViewSortEntry[] }>(
    `/api/views/${viewId}/sort/${issueId}`,
    { method: 'PUT', body: { targetIndex } },
  );
  return res.entries;
}
