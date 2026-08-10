// 檢查一次狀態轉換是否合法。
//
// 對應 Spec：WorkflowLogic 的 validateStatusTransition。
// 依序檢查轉換對、角色、必填欄位、終止狀態結案原因、結案原因合法性，任一失敗即中止。

import type { ValidationResult } from '../shared/index.js';
import { invalid, valid } from '../shared/index.js';
import type { StatusTransitionInput, WorkflowTransitionRule } from './types.js';

function isProvided(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function findTransition(input: StatusTransitionInput): WorkflowTransitionRule | undefined {
  return input.definition.transitions.find(
    (t) => t.fromState === input.issue.currentStatus && t.toState === input.targetStatus,
  );
}

export type TransitionAllowedFailureCode = 'TRANSITION_NOT_ALLOWED';

/** 轉換對檢查：來源轉目標須在 WorkflowTransitions 允許的轉換對裡。 */
export function checkTransitionAllowed(
  input: StatusTransitionInput,
): ValidationResult<TransitionAllowedFailureCode> {
  if (findTransition(input) === undefined) {
    return invalid(
      'TRANSITION_NOT_ALLOWED',
      `不允許從「${input.issue.currentStatus}」轉換到「${input.targetStatus}」`,
    );
  }
  return valid;
}

export type ActorRoleFailureCode = 'ACTOR_ROLE_NOT_ALLOWED';

/** 角色檢查：執行者須符合轉換條件要求的角色，null 代表不限角色。 */
export function checkActorRole(input: StatusTransitionInput): ValidationResult<ActorRoleFailureCode> {
  const transition = findTransition(input);
  if (transition === undefined || transition.requiredRole === null) {
    return valid;
  }
  if (!input.actor.roleNames.includes(transition.requiredRole)) {
    return invalid('ACTOR_ROLE_NOT_ALLOWED', `需要角色「${transition.requiredRole}」`);
  }
  return valid;
}

export type RequiredFieldsFailureCode = 'REQUIRED_FIELDS_MISSING';

/** 必填欄位檢查：轉換條件要求的必填欄位須在工單上有值。 */
export function checkRequiredFieldsPresent(
  input: StatusTransitionInput,
): ValidationResult<RequiredFieldsFailureCode> {
  const transition = findTransition(input);
  if (transition === undefined) {
    return valid;
  }
  const missing = transition.requiredFields.filter(
    (fieldName) => !input.issue.fieldsWithValue.includes(fieldName),
  );
  if (missing.length > 0) {
    return invalid('REQUIRED_FIELDS_MISSING', `缺少必填欄位：${missing.join('、')}`);
  }
  return valid;
}

export type ResolutionRequiredFailureCode = 'RESOLUTION_REQUIRED';

/** 終止狀態結案原因檢查：目標狀態為終止狀態時須提供結案原因。 */
export function checkResolutionRequiredForTerminal(
  input: StatusTransitionInput,
): ValidationResult<ResolutionRequiredFailureCode> {
  const targetState = input.definition.states.find((s) => s.name === input.targetStatus);
  if (targetState?.isTerminal === true && !isProvided(input.resolution)) {
    return invalid('RESOLUTION_REQUIRED', '轉入終止狀態須提供結案原因');
  }
  return valid;
}

export type ResolutionValueFailureCode = 'RESOLUTION_NOT_ALLOWED';

/** 結案原因合法性檢查：有提供結案原因時須在該型別的 ResolutionOptions 裡。 */
export function checkResolutionValueAllowed(
  input: StatusTransitionInput,
): ValidationResult<ResolutionValueFailureCode> {
  if (!isProvided(input.resolution)) {
    return valid;
  }
  const allowed = input.definition.resolutionOptions.some((o) => o.value === input.resolution);
  if (!allowed) {
    return invalid('RESOLUTION_NOT_ALLOWED', `結案原因「${input.resolution}」不在選項清單`);
  }
  return valid;
}

export type StatusTransitionFailureCode =
  | TransitionAllowedFailureCode
  | ActorRoleFailureCode
  | RequiredFieldsFailureCode
  | ResolutionRequiredFailureCode
  | ResolutionValueFailureCode;

/** 依 spec 順序逐項檢查，一失敗即短路：轉換對 → 角色 → 必填欄位 → 終止須結案原因 → 結案原因合法。 */
export function validateStatusTransition(
  input: StatusTransitionInput,
): ValidationResult<StatusTransitionFailureCode> {
  const transitionResult = checkTransitionAllowed(input);
  if (!transitionResult.ok) return transitionResult;

  const roleResult = checkActorRole(input);
  if (!roleResult.ok) return roleResult;

  const fieldsResult = checkRequiredFieldsPresent(input);
  if (!fieldsResult.ok) return fieldsResult;

  const resolutionRequiredResult = checkResolutionRequiredForTerminal(input);
  if (!resolutionRequiredResult.ok) return resolutionRequiredResult;

  return checkResolutionValueAllowed(input);
}
