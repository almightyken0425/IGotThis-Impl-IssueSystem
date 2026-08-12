// 檢視 domain。
//
// 對應 spec 的 Logic 層檢視邏輯。
// 承載範圍：
// - 看板欄集合與欄序：多型別狀態清單的保序併入
// - 手動排序位置：拖放結果換算成該檢視內的排序值
// - 篩選條件套用、已排序/未排序分類、日曆選用決定、工期天數計算
//
// 純本地計算，型別的狀態清單以參數傳入，不碰資料庫。

export { admitNewContainerIssue } from './admitNewContainerIssue.js';
export type { ContainerIssuePartition } from './admitNewContainerIssue.js';
export { applyViewFilter } from './applyViewFilter.js';
export type { FilterResult } from './applyViewFilter.js';
export { expandDataSource } from './expandDataSource.js';
export type { OrgScopeCandidates } from './expandDataSource.js';
export { buildKanbanColumns } from './kanbanColumns.js';
export { computeIssueDuration } from './computeIssueDuration.js';
export { resolveViewCalendar } from './resolveViewCalendar.js';
export { assignSortPosition, SortPositionError } from './sortPosition.js';
export type { SortPositionCode } from './sortPosition.js';
export type {
  AccountCalendarSetting,
  FilterCondition,
  FilterConfig,
  IssueDuration,
  IssueFilterCandidate,
  IssueTypeWorkflow,
  KanbanColumn,
  SortEntryRef,
  ViewCalendarSetting,
  WorkflowStateRef,
} from './types.js';
