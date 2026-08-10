// 檢視 domain 的型別。
// 欄位名對齊 spec 的 Model 層：WorkflowStates 的 name、sortOrder。

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
