// 欄位定義 API · /api/fields 之下的唯讀查詢
//
// 供工單詳情頁的欄位區使用：列出欄位定義取得 label／readonly／kind 等中繼
// 資料，實際值另由 issues.ts 的 listFieldValues 取得。建立與修改欄位定義
// 不在此輪範圍內，不封裝。

import { apiFetch } from './client';
import type { FieldDef } from './types';

/** 列出本 Company 的欄位定義，依名稱排序。 */
export async function listFieldDefs(): Promise<readonly FieldDef[]> {
  const res = await apiFetch<{ fieldDefs: readonly FieldDef[] }>('/api/fields/defs');
  return res.fieldDefs;
}
