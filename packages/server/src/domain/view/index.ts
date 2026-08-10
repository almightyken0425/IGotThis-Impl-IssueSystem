// 檢視 domain。
//
// 對應 spec 的 Logic 層檢視邏輯。
// 承載範圍：
// - 看板欄集合與欄序：多型別狀態清單的保序併入
// - 手動排序位置：拖放結果換算成該檢視內的排序值
//
// 純本地計算，型別的狀態清單以參數傳入，不碰資料庫。

export { buildKanbanColumns } from './kanbanColumns.js';
export { assignSortPosition, SortPositionError } from './sortPosition.js';
export type { SortPositionCode } from './sortPosition.js';
export type {
  IssueTypeWorkflow,
  KanbanColumn,
  SortEntryRef,
  WorkflowStateRef,
} from './types.js';
