// 狀態流程 domain 的型別定義。
//
// 實體與欄位名對齊對側 Spec git 的 Model 層：
// - `WorkflowStates`／`WorkflowTransitions`／`ResolutionOptions` 見工單與型別資料結構
//
// domain 為純函式層，型別只描述資料形狀，不含任何持久化語意。
//
// 檢查結果的形狀走共用層的 `ValidationResult`，本檔不另立一套。

/** 流程狀態 `WorkflowStates` 的判定摘要，驗證只需名稱與是否終止。 */
export interface WorkflowStateSummary {
  readonly name: string;
  readonly isTerminal: boolean;
}

/** 流程轉換 `WorkflowTransitions` 的判定摘要。 */
export interface WorkflowTransitionRule {
  readonly fromState: string;
  readonly toState: string;
  /** 轉換條件的執行者角色；null 代表不限角色。 */
  readonly requiredRole: string | null;
  /** 轉換必填欄位名稱清單；空清單代表無必填。 */
  readonly requiredFields: readonly string[];
}

/** 結案原因選項 `ResolutionOptions` 的判定摘要。 */
export interface ResolutionOptionValue {
  readonly value: string;
}

/** 工單型別的流程定義快照；`validateStatusTransition`／`changeIssueStatus` 共用。 */
export interface WorkflowDefinition {
  readonly states: readonly WorkflowStateSummary[];
  readonly transitions: readonly WorkflowTransitionRule[];
  readonly resolutionOptions: readonly ResolutionOptionValue[];
}

/**
 * `updateWorkflowDefinition` 編輯用的狀態輸入，含 `isInitial`——
 * `WorkflowStateSummary` 只服務轉換檢查，不含這個欄位，兩者職責不同不共用。
 */
export interface WorkflowStateEdit {
  readonly name: string;
  readonly isInitial: boolean;
  readonly isTerminal: boolean;
}

/** `updateWorkflowDefinition` 編輯用的轉換輸入，形狀同 `WorkflowTransitionRule`，型別各自獨立以免耦合驗證與編輯兩種用途。 */
export interface WorkflowTransitionEdit {
  readonly fromState: string;
  readonly toState: string;
  readonly requiredRole: string | null;
  readonly requiredFields: readonly string[];
}

/** 待檢查工單的摘要：現況狀態、目前已有值的欄位名稱清單。 */
export interface IssueWorkflowSnapshot {
  readonly currentStatus: string;
  readonly fieldsWithValue: readonly string[];
}

/** 執行者：角色檢查只問持有角色清單裡有沒有轉換條件要求的那個。 */
export interface WorkflowActor {
  readonly roleNames: readonly string[];
}

/**
 * `validateStatusTransition` 與 `changeIssueStatus` 共用的輸入形狀。
 * 兩者吃同一份型別，`changeIssueStatus` 內部直接把整個 input 轉呼叫
 * `validateStatusTransition`，不重複定義一份「驗證版」與「變更版」。
 */
export interface StatusTransitionInput {
  readonly definition: WorkflowDefinition;
  readonly issue: IssueWorkflowSnapshot;
  readonly targetStatus: string;
  readonly actor: WorkflowActor;
  /** 結案原因，轉入終止狀態時提供；空字串視同未提供。 */
  readonly resolution?: string | null;
}
