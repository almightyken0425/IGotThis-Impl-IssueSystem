// ListScreen · 篩選條件的純函式運算
//
// 對側 spec：no3_product_specs/no1_issue_system/no3_logics/no7_view_logic.md 的
// applyViewFilter；no2_screens/no1_list_screen.md 的篩選互動。
// 對側 design：`AGENTS.md`「設計待辦」的篩選面板定案。
//
// Views.filterConfig 是後端從未驗證形狀的 opaque JSON，後端 parseFilterConfig
// 只認 `{ conditions: [{ fieldName, operator: 'equals', value }] }`，多條件全
// AND、只有 `equals` 一種運算子，本檔不發明後端不支援的形狀。
//
// 不碰 React、不碰網路——畫面層（ListScreen.tsx）負責讀寫 currentView.filterConfig
// 與呼叫持久化 API，本檔只做資料轉換與陣列運算，比照 columnConfig.ts 同一套分工。

import type { FieldDef } from '../../api';
import type { SelectOption } from '../../components/controls';

/** 面板編輯值一律為字串。後端 equals 只比對數字與布林的標準文字表示。 */
export interface FilterConditionRow {
  readonly id: string;
  readonly fieldName: string;
  readonly value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 解析檢視的 filterConfig 成可編輯的列。fail-open，形狀不符（非物件／
 * conditions 非陣列）或條件本身不符（非物件／fieldName 非字串）視為沒有這筆，
 * 不中斷其餘列的解析。id 用陣列位置生成，同一次解析穩定、跨解析不保證穩定
 * （不需要——每次開面板都是新一輪解析）。
 */
export function parseFilterConditionRows(filterConfig: unknown): readonly FilterConditionRow[] {
  if (!isRecord(filterConfig)) return [];
  const conditions = filterConfig['conditions'];
  if (!Array.isArray(conditions)) return [];

  const rows: FilterConditionRow[] = [];
  conditions.forEach((condition, index) => {
    if (!isRecord(condition)) return;
    const fieldName = condition['fieldName'];
    if (typeof fieldName !== 'string') return;
    rows.push({ id: `row-${index}`, fieldName, value: String(condition['value'] ?? '') });
  });
  return rows;
}

/**
 * 列還原成待寫回 Views.filterConfig 的 JSON。欄位未選或值空白的列視為未完成，
 * 送出前濾掉，不因草稿列還沒填完就擋下其他已完成的條件。全部濾掉後回傳
 * `null`——等同清空篩選，不留一個空 conditions 陣列的中間態。
 */
export function buildFilterConfig(
  rows: readonly FilterConditionRow[],
): { readonly conditions: readonly { fieldName: string; operator: 'equals'; value: string }[] } | null {
  const conditions = rows
    .filter((row) => row.fieldName !== '' && row.value !== '')
    .map((row) => ({ fieldName: row.fieldName, operator: 'equals' as const, value: row.value }));
  return conditions.length > 0 ? { conditions } : null;
}

/** 新增一列空白條件，附加在陣列尾端；id 由呼叫端傳入（畫面層以遞增序號產生，避免本檔碰亂數）。 */
export function addFilterConditionRow(
  rows: readonly FilterConditionRow[],
  id: string,
): readonly FilterConditionRow[] {
  return [...rows, { id, fieldName: '', value: '' }];
}

/** 移除一列；id 不存在時不動作（回傳原參照）。 */
export function removeFilterConditionRow(
  rows: readonly FilterConditionRow[],
  id: string,
): readonly FilterConditionRow[] {
  if (!rows.some((row) => row.id === id)) return rows;
  return rows.filter((row) => row.id !== id);
}

/** 改一列的欄位或值；id 不存在時不動作（回傳原參照）。 */
export function updateFilterConditionRow(
  rows: readonly FilterConditionRow[],
  id: string,
  patch: Partial<Pick<FilterConditionRow, 'fieldName' | 'value'>>,
): readonly FilterConditionRow[] {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return rows;
  const next = rows.slice();
  next[index] = { ...next[index]!, ...patch };
  return next;
}

/**
 * 欄位定義轉篩選面板的欄位下拉選項：只收單值欄位（`kind === 'single'`），
 * 多值（如 ChangeLog）與關聯欄位無法用 `equals` 比對單一值，不列入選項；
 * 依 label 排序，選單順序跟型別管理畫面的排序邏輯無關、各自獨立。
 */
export function filterFieldOptions(fieldDefs: readonly FieldDef[]): readonly SelectOption[] {
  return fieldDefs
    .filter((def) => def.kind === 'single')
    .map((def) => ({ value: def.name, label: def.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
}
