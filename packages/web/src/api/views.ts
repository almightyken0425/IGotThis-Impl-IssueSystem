// 檢視 API · /api/views 之下的清單與建立
//
// 這輪只需要「當前檢視選擇機制」用得到的兩支；排序、篩選、看板欄等其餘
// /api/views 端點留給下一輪三個畫面改接時再封裝。

import { apiFetch } from './client';
import type { CreateViewInput, View } from './types';

/** 當前帳號名下的檢視清單。 */
export async function listMyViews(): Promise<readonly View[]> {
  const res = await apiFetch<{ views: readonly View[] }>('/api/views?scope=mine');
  return res.views;
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
