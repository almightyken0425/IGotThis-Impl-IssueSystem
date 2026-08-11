// 檢視 domain 的型別。
// 欄位名對齊 spec 的 Model 層：WorkflowStates 的 name、sortOrder。

import type { DayUnit } from '../shared/index.js';

/** WorkflowStates 中參與看板欄序的欄位子集。 */
export interface WorkflowStateRef {
  /** 狀態名稱；跨型別同名即同一欄。 */
  readonly name: string;
  /** 狀態排列位置。 */
  readonly sortOrder: number;
}

/** 一種工單型別及其流程狀態清單。 */
export interface IssueTypeWorkflow {
  readonly issueTypeId: string;
  readonly states: readonly WorkflowStateRef[];
}

/** 看板的一欄。 */
export interface KanbanColumn {
  readonly name: string;
}

/** ViewSortEntries 中參與位置計算的欄位子集。 */
export interface SortEntryRef {
  /** 排序對象工單；同檢視內每工單至多一筆。 */
  readonly issueId: string;
  /** 手動排序值，同檢視內決定先後。 */
  readonly sortValue: number;
}

/** Views 中參與日曆決定的欄位子集。 */
export interface ViewCalendarSetting {
  readonly calendarName: string | null;
}

/** Accounts 中參與日曆決定的欄位子集。 */
export interface AccountCalendarSetting {
  readonly defaultCalendarName: string | null;
}

/** computeIssueDuration 的結果；起訖日缺一即無工期可算。 */
export type IssueDuration =
  | { readonly hasDuration: true; readonly days: number; readonly unit: DayUnit }
  | { readonly hasDuration: false };

/** applyViewFilter 的候選工單投影：篩選條件比對的欄位值皆收在 fields。 */
export interface IssueFilterCandidate {
  readonly issueId: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/** 單一篩選條件；同 fieldName 對同一個 value 相等比對。 */
export interface FilterCondition {
  readonly fieldName: string;
  readonly operator: 'equals';
  readonly value: unknown;
}

/** Views.filterConfig 窄化後的形狀；conditions 全 AND。 */
export interface FilterConfig {
  readonly conditions: readonly FilterCondition[];
}
