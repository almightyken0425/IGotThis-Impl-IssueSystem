// 欄位定義 API · /api/fields 之下的欄位組與欄位定義讀寫
//
// 供工單詳情頁的欄位區與 TypeDefinitionScreen 使用。前者只需要 label／
// readonly／kind 等中繼資料查詢，後者需要完整的建立／改／刪。

import { apiFetch } from './client';
import type { FieldDef, FieldSetDef } from './types';

// ---- 欄位組 ----

/** 建立欄位組；名稱在 Company 內唯一，重複回 409。 */
export async function createFieldSet(name: string): Promise<FieldSetDef> {
  const res = await apiFetch<{ fieldSet: FieldSetDef }>('/api/fields/sets', {
    method: 'POST',
    body: { name },
  });
  return res.fieldSet;
}

/** 列出本 Company 的欄位組，依名稱排序。 */
export async function listFieldSets(): Promise<readonly FieldSetDef[]> {
  const res = await apiFetch<{ fieldSets: readonly FieldSetDef[] }>('/api/fields/sets');
  return res.fieldSets;
}

/** 刪除欄位組；系統內建或底下還有欄位時後端回 403／409。 */
export async function deleteFieldSet(name: string): Promise<void> {
  await apiFetch<void>(`/api/fields/sets/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ---- 欄位定義 ----

export interface CreateFieldDefInput {
  readonly name: string;
  readonly fieldSetName: string;
  readonly kind: FieldDef['kind'];
  readonly valueType: string;
  readonly label: string;
  readonly readonly?: boolean;
  readonly rollupable?: boolean;
  readonly rollupFn?: FieldDef['rollupFn'];
  readonly tracked?: boolean;
}

/** 建立欄位定義；所屬欄位組須先存在，名稱在 Company 內唯一。 */
export async function createFieldDef(input: CreateFieldDefInput): Promise<FieldDef> {
  const res = await apiFetch<{ fieldDef: FieldDef }>('/api/fields/defs', {
    method: 'POST',
    body: input,
  });
  return res.fieldDef;
}

/** 列出本 Company 的欄位定義，依名稱排序。 */
export async function listFieldDefs(): Promise<readonly FieldDef[]> {
  const res = await apiFetch<{ fieldDefs: readonly FieldDef[] }>('/api/fields/defs');
  return res.fieldDefs;
}

/** 改欄位定義的顯示名稱；系統內建時後端回 403。 */
export async function updateFieldLabel(name: string, label: string): Promise<FieldDef> {
  const res = await apiFetch<{ fieldDef: FieldDef }>(`/api/fields/defs/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: { label },
  });
  return res.fieldDef;
}

/** 刪除欄位定義；系統內建或已有工單資料時後端回 403／409。 */
export async function deleteFieldDef(name: string): Promise<void> {
  await apiFetch<void>(`/api/fields/defs/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
