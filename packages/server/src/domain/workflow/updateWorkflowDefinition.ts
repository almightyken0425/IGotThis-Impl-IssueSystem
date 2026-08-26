// 檢查一次流程定義編輯是否合法。
//
// 對應 Spec：WorkflowLogic 的 updateWorkflowDefinition。可調整項目本身
// （加/改/刪狀態、轉換、結案原因）由呼叫端整理成新的完整清單後在此驗證，
// 通過才落庫；ResolutionOptions 與 states/transitions 無結構性關聯，
// 不在本檔驗證範圍。

import type { ValidationResult } from '../shared/index.js';
import { invalid, valid } from '../shared/index.js';
import type { WorkflowStateEdit, WorkflowTransitionEdit } from './types.js';

export type StateNameDuplicateFailureCode = 'STATE_NAME_DUPLICATE';

/** 狀態名稱檢查：Company 內同型別下的狀態名稱不可重複。 */
export function checkStateNamesUnique(
  states: readonly WorkflowStateEdit[],
): ValidationResult<StateNameDuplicateFailureCode> {
  const seen = new Set<string>();
  for (const state of states) {
    if (seen.has(state.name)) {
      return invalid('STATE_NAME_DUPLICATE', `狀態名稱「${state.name}」重複`);
    }
    seen.add(state.name);
  }
  return valid;
}

export type InitialStateFailureCode = 'INITIAL_STATE_COUNT_INVALID';

/** 起始狀態檢查：恰好一個狀態為起始狀態，不可零個或多個。 */
export function checkExactlyOneInitialState(
  states: readonly WorkflowStateEdit[],
): ValidationResult<InitialStateFailureCode> {
  const initialCount = states.filter((s) => s.isInitial).length;
  if (initialCount !== 1) {
    return invalid(
      'INITIAL_STATE_COUNT_INVALID',
      `起始狀態須恰好一個，目前有 ${initialCount} 個`,
    );
  }
  return valid;
}

export type TransitionStateFailureCode = 'TRANSITION_STATE_NOT_FOUND';

/** 轉換狀態檢查：每筆轉換的來源與目標須都在狀態清單裡。 */
export function checkTransitionStatesExist(
  states: readonly WorkflowStateEdit[],
  transitions: readonly WorkflowTransitionEdit[],
): ValidationResult<TransitionStateFailureCode> {
  const names = new Set(states.map((s) => s.name));
  for (const transition of transitions) {
    if (!names.has(transition.fromState) || !names.has(transition.toState)) {
      return invalid(
        'TRANSITION_STATE_NOT_FOUND',
        `轉換「${transition.fromState} → ${transition.toState}」引用不存在的狀態`,
      );
    }
  }
  return valid;
}

export type UpdateWorkflowDefinitionFailureCode =
  | StateNameDuplicateFailureCode
  | InitialStateFailureCode
  | TransitionStateFailureCode;

/** 依序檢查：狀態名稱不重複 → 恰好一個起始狀態 → 轉換引用的狀態存在，一失敗即短路。 */
export function validateWorkflowDefinitionEdit(
  states: readonly WorkflowStateEdit[],
  transitions: readonly WorkflowTransitionEdit[],
): ValidationResult<UpdateWorkflowDefinitionFailureCode> {
  const nameResult = checkStateNamesUnique(states);
  if (!nameResult.ok) return nameResult;

  const initialResult = checkExactlyOneInitialState(states);
  if (!initialResult.ok) return initialResult;

  return checkTransitionStatesExist(states, transitions);
}
