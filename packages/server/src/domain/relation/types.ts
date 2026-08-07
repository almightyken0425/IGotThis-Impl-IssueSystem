// 關聯完整性 domain 的型別定義。
//
// 實體與欄位名對齊對側 Spec git 的 Model 層：
// - `RelationTypeDefinitions` 見關聯資料結構
// - `IssueRelations` 見關聯資料結構
// - `Issues` 見工單與型別資料結構
//
// domain 為純函式層，型別只描述資料形狀，不含任何持久化語意。
//
// 檢查結果的形狀走共用層的 `ValidationResult`，本檔不另立一套。

import { DomainError } from '../shared/index.js';

/** 關聯型別定義 `RelationTypeDefinitions`。 */
export interface RelationTypeDefinition {
  readonly id: string;
  readonly companyId: string;
  /** 識別名稱，同 Company 內唯一；內建四關聯的值見 `StandardRelationTypeName`。 */
  readonly name: string;
  /** 獨佔開關；為真時被指端只能被一個持有端指到。 */
  readonly exclusive: boolean;
  /** 禁環開關；為真時同型別關聯不得成環。 */
  readonly acyclic: boolean;
  /** 有序開關；為真時關聯使用序位值。 */
  readonly ordered: boolean;
  /** 對稱開關；為真時關聯無方向，查詢時雙向合併。 */
  readonly symmetric: boolean;
  /** 彙總開關；為真時被指端的值往上累計至持有端。 */
  readonly rollup: boolean;
  /** 系統旗標；內建四關聯為真，不可刪除。 */
  readonly system: boolean;
  readonly createdOn: number;
  readonly updatedOn: number;
}

/** 工單關聯 `IssueRelations`。 */
export interface IssueRelation {
  readonly id: string;
  readonly companyId: string;
  /** 持有端工單；關聯只存持有端這一側。 */
  readonly fromIssueId: string;
  /** 被指端工單；被指端不持有回指欄位。 */
  readonly toIssueId: string;
  readonly relationTypeId: string;
  /** 序位；型別的有序開關為假時維持預設值 0。 */
  readonly ordinal: number;
  /** 獨佔複製欄；值恆同關聯型別定義的獨佔開關。 */
  readonly exclusive: boolean;
  readonly createdOn: number;
  readonly updatedOn: number;
}

/** 工單 `Issues`。 */
export interface Issue {
  readonly id: string;
  readonly companyId: string;
  /** 所屬工單集；工單可移至其他工單集。 */
  readonly issueSetId: string;
  readonly issueTypeId: string;
  readonly issueKey: string;
}

/** 母子關聯的識別名稱；母子邊界檢查與層級計算以此認型別。 */
export const CHILDREN_RELATION_TYPE_NAME = 'Children';

/** 標準關聯型別 `StandardRelationTypes` 的識別名稱。 */
export type StandardRelationTypeName = 'Children' | 'Container' | 'Before' | 'RelatedTo';

/** 關聯型別定義的五個行為開關，組合檢查只看這五欄。 */
export type RelationTypeSwitches = Pick<
  RelationTypeDefinition,
  'exclusive' | 'acyclic' | 'ordered' | 'symmetric' | 'rollup'
>;

/** 待寫入的關聯，只帶三個決定性欄位；`ordinal` 與 `exclusive` 由寫入端補。 */
export type RelationCandidate = Pick<IssueRelation, 'fromIssueId' | 'toIssueId' | 'relationTypeId'>;

/** 完整性檢查用得到的關聯型別欄位。 */
export type RelationTypeRules = Pick<
  RelationTypeDefinition,
  'id' | 'name' | 'exclusive' | 'acyclic'
>;

/** 工單的所屬工單集，母子邊界檢查與層級計算只需這兩欄。 */
export type IssueLocation = Pick<Issue, 'id' | 'issueSetId'>;

export type RelationErrorCode = 'RELATION_CYCLE';

/** 關聯資料本身已壞、計算無法收斂時擲出。 */
export class RelationError extends DomainError<RelationErrorCode> {}
