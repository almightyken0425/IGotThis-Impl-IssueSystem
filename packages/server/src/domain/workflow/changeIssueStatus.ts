// 通過檢查後決定該落地的狀態與結案原因。
//
// 對應 Spec：WorkflowLogic 的 changeIssueStatus。
// 只回傳「該寫什麼」，不碰資料庫；實際寫入交給呼叫端。

import { validateStatusTransition } from './validateStatusTransition.js';
import type { StatusTransitionFailureCode } from './validateStatusTransition.js';
import type { StatusTransitionInput } from './types.js';
import type { ValidationFailure } from '../shared/index.js';

/** 通過驗證後該落到欄位機制的狀態；呼叫端據此寫入 status，終止時一併寫 resolution。 */
export interface StatusChangeApplied {
  readonly ok: true;
  readonly status: string;
  /** 進終止狀態時帶結案原因；非終止轉換為 undefined。 */
  readonly resolution?: string;
}

export type StatusChangeRejected = ValidationFailure<StatusTransitionFailureCode>;
export type ChangeIssueStatusResult = StatusChangeApplied | StatusChangeRejected;

/** 呼叫 validateStatusTransition 取得檢查結果，禁止則原樣透傳；允許則決定要寫入的內容。 */
export function changeIssueStatus(input: StatusTransitionInput): ChangeIssueStatusResult {
  const check = validateStatusTransition(input);
  if (!check.ok) {
    return check;
  }

  const targetState = input.definition.states.find((s) => s.name === input.targetStatus);
  const isTerminal = targetState?.isTerminal === true;

  // exactOptionalPropertyTypes：非終止轉換整個省略 resolution 鍵，不賦值 undefined。
  return isTerminal
    ? { ok: true, status: input.targetStatus, resolution: input.resolution as string }
    : { ok: true, status: input.targetStatus };
}
