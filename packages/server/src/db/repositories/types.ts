// repository 對外吐出的資料型別。
//
// 命名與欄位對齊 spec no1_data_models：
// - 容器骨架見 no1_container_model
// - 工單與型別見 no7_issue_model
// - 欄位值見 no3_field_model
//
// domain 已定義的實體不在此重造：工單走 domain 的 `Issue`、
// 彙總模式走 domain 的 `RollupMode`。domain 未涵蓋的容器與定義類實體，
// 其資料形狀由本層承載（domain 為純邏輯層、不含持久化實體）。

import type { RollupFn, RollupMode } from '../../domain/index.js';

// ============================================================
// 容器骨架 (no1_container_model)
// ============================================================

/** 公司 `Companies`；`id` 自身即租戶鍵，不另設 companyId。 */
export interface Company {
  readonly id: string;
  readonly name: string;
}

/** 團隊 `Teams`。 */
export interface Team {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
}

/** 產品 `Products`。 */
export interface Product {
  readonly id: string;
  readonly companyId: string;
  readonly teamId: string;
  readonly name: string;
}

/** 管理域 `Mgmts`；`containerIssueSetId` 指向主題單位置現任工單集。 */
export interface Mgmt {
  readonly id: string;
  readonly companyId: string;
  readonly productId: string;
  readonly name: string;
  readonly containerIssueSetId: string;
}

/** 工單集 `IssueSets`。 */
export interface IssueSet {
  readonly id: string;
  readonly companyId: string;
  readonly mgmtId: string;
  readonly name: string;
  readonly key: string;
  /** 下一個要發出的流水號；只前進、不回收。 */
  readonly nextSeq: number;
}

/** 容器骨架的巢狀樹：Company > Teams > Products > Mgmts > IssueSets。 */
export interface MgmtNode extends Mgmt {
  readonly issueSets: readonly IssueSet[];
}
export interface ProductNode extends Product {
  readonly mgmts: readonly MgmtNode[];
}
export interface TeamNode extends Team {
  readonly products: readonly ProductNode[];
}
export interface CompanyTree extends Company {
  readonly teams: readonly TeamNode[];
}

// ============================================================
// 工單型別與流程 (no7_issue_model)
// ============================================================

/** 工單型別定義 `IssueTypeDefinitions`。 */
export interface IssueTypeDefinition {
  readonly id: string;
  readonly companyId: string;
  /** 識別名稱，同 Company 內唯一。 */
  readonly name: string;
  /** 顯示名稱，可改。 */
  readonly label: string;
  /** 欄位組配方清單，指向欄位組定義。 */
  readonly fieldSets: readonly string[];
  /** 系統旗標；為真代表內建型別。 */
  readonly system: boolean;
}

/** 流程狀態 `WorkflowStates`。 */
export interface WorkflowState {
  readonly companyId: string;
  readonly issueTypeId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly isInitial: boolean;
  readonly isTerminal: boolean;
}

/** 流程轉換 `WorkflowTransitions`。 */
export interface WorkflowTransition {
  readonly companyId: string;
  readonly issueTypeId: string;
  readonly fromState: string;
  readonly toState: string;
  /** 轉換條件的執行者角色；null 代表不限角色。 */
  readonly requiredRole: string | null;
  /** 轉換必填欄位名稱清單，空清單代表無必填。 */
  readonly requiredFields: readonly string[];
}

/** 結案原因選項 `ResolutionOptions`。 */
export interface ResolutionOption {
  readonly companyId: string;
  readonly issueTypeId: string;
  readonly value: string;
  readonly sortOrder: number;
  readonly system: boolean;
}

// ============================================================
// 工單欄位值 (no3_field_model)
// ============================================================

/**
 * 工單欄位單值 `IssueFieldValues`。
 *
 * 值以 jsonb 儲存、跨欄位型別各異，故 `value` 為 unknown；
 * domain 彙總層另有 `IssueFieldValue` 投影，將值收窄為日期或數字、只服務彙總計算。
 */
export interface StoredFieldValue {
  readonly companyId: string;
  readonly issueId: string;
  readonly fieldName: string;
  readonly value: unknown;
  /** 彙總模式；僅可彙總欄位使用，其餘為 null。 */
  readonly rollupMode: RollupMode | null;
}

/** 欄位形狀：單值、多筆、關聯三者之一。 */
export type FieldKind = 'single' | 'multi' | 'relation';

/** 欄位組定義 `FieldSetDefs`；複合主鍵為（companyId, name）。 */
export interface FieldSetDef {
  readonly companyId: string;
  readonly name: string;
  /** 系統內建旗標；為真代表不可刪除、不可停用。 */
  readonly system: boolean;
}

/**
 * 欄位定義 `FieldDefs`；複合主鍵為（companyId, name）。
 *
 * 完整實體。domain 彙總層另有 `FieldDef` 投影，只取 companyId、name、
 * rollupable、rollupFn 服務彙總計算；本型別為其超集，結構上可直接餵給彙總邏輯。
 */
export interface FieldDef {
  readonly companyId: string;
  readonly name: string;
  readonly fieldSetName: string;
  readonly kind: FieldKind;
  /** 值型別原語名稱，值域限值型別原語清單。 */
  readonly valueType: string;
  readonly system: boolean;
  /** 唯讀旗標；為真代表值由系統寫入，使用者不可編輯。 */
  readonly readonly: boolean;
  readonly rollupable: boolean;
  /** 彙總算法，最早、最晚、加總三者之一；不可彙總恆為 null。 */
  readonly rollupFn: RollupFn | null;
  /** 追蹤開關；為真的欄位每次異動寫進變更歷史。 */
  readonly tracked: boolean;
  /** 顯示名稱，可改，跟隨 Company 設定的語言。 */
  readonly label: string;
}

/**
 * 工單欄位多筆記錄 `IssueFieldRecords`；承載留言、附件、工時、變更歷史。
 *
 * 單筆帶自身 id 可獨立定位、引用、刪除；value 以 jsonb 儲存、跨欄位型別各異，故為 unknown。
 */
export interface IssueFieldRecord {
  readonly id: string;
  readonly companyId: string;
  readonly issueId: string;
  readonly fieldName: string;
  readonly value: unknown;
  /** 單筆的作者，指向帳號。 */
  readonly authorId: string;
  /** 單筆的時間，Unix ms。 */
  readonly createdOn: number;
}
