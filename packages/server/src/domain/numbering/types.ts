// 編號 domain 的型別。
// 欄位名對齊 spec 的 Model 層：IssueSets 的 companyId、key、nextSeq。
//
// 檢查結果與擲錯的形狀走共用層，本檔不另立一套。

import type { ValidationResult } from '../shared/index.js';
import { DomainError } from '../shared/index.js';

/** IssueSets 中參與 KEY 唯一性判定的欄位子集。 */
export interface IssueSetKeyEntry {
  readonly companyId: string;
  readonly key: string;
}

export interface ValidateIssueSetKeyInput {
  /** 使用者指定的 KEY。 */
  readonly key: string;
  /** 所屬 Company 租戶鍵。 */
  readonly companyId: string;
  /** 既有工單集，唯一性只在同 companyId 內比對。 */
  readonly existingIssueSets: readonly IssueSetKeyEntry[];
}

/** IssueSets 中承載流水號序列的欄位子集。 */
export interface IssueSetSequenceState {
  /** 下一個要發出的流水號；只前進，刪除的號不回收。 */
  readonly nextSeq: number;
}

export interface TakeNextSeqResult {
  /** 本次取得的流水號。 */
  readonly seq: number;
  /** 前進後的 nextSeq，由呼叫端寫回 IssueSets。 */
  readonly nextSeq: number;
}

/** assignIssueKey 需要的工單集狀態：前綴與序列。 */
export interface IssueSetNumberingState extends IssueSetSequenceState {
  /** 工單集 KEY，作為編號前綴。 */
  readonly key: string;
}

export interface AssignIssueKeyResult {
  /** 產生的工單編號，寫入 Issues.issueKey。 */
  readonly issueKey: string;
  /** 前進後的 nextSeq，由呼叫端寫回 IssueSets。 */
  readonly nextSeq: number;
}

export type IssueSetKeyErrorCode =
  | 'LENGTH_OUT_OF_RANGE'
  | 'INVALID_CHARACTER'
  | 'LEADING_DIGIT'
  | 'DUPLICATE_IN_COMPANY';

export interface SuggestIssueSetKeyInput {
  /** 所屬產品名稱。 */
  readonly productName: string;
  /** 工單集名稱。 */
  readonly issueSetName: string;
}

export type ValidateIssueSetKeyResult = ValidationResult<IssueSetKeyErrorCode>;

export type NumberingErrorCode = 'SEQUENCE_OUT_OF_RANGE';

/** 序列狀態本身不合法時擲出；屬呼叫端違反前置條件，不是使用者輸入錯誤。 */
export class NumberingError extends DomainError<NumberingErrorCode> {}
