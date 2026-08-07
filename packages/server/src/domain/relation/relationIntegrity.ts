// 建立工單關聯前的完整性檢查。
//
// 對應 Spec：RelationIntegrityLogic 的 createRelation。
// 寫入前依關聯型別的開關逐項檢查，任一失敗即中止。

import type { ValidationResult } from '../shared/index.js';
import { invalid, valid } from '../shared/index.js';
import type { IssueLocation, RelationCandidate, RelationTypeRules } from './types.js';
import { CHILDREN_RELATION_TYPE_NAME } from './types.js';

export type ExclusiveFailureCode = 'exclusive_target_already_held';

export interface ExclusiveCheckInput {
  readonly candidate: RelationCandidate;
  readonly relationType: RelationTypeRules;
  /** 現存關聯記錄，含其他型別；檢查自行以型別過濾。 */
  readonly existingRelations: readonly RelationCandidate[];
}

/** 獨佔檢查：獨佔開關為真時，被指端只能被一個持有端指到。 */
export function checkExclusiveConstraint(
  input: ExclusiveCheckInput,
): ValidationResult<ExclusiveFailureCode> {
  if (!input.relationType.exclusive) {
    return valid;
  }

  const held = input.existingRelations.some(
    (relation) =>
      relation.relationTypeId === input.candidate.relationTypeId &&
      relation.toIssueId === input.candidate.toIssueId,
  );

  if (held) {
    return invalid('exclusive_target_already_held', '被指端只能被一個持有端指到');
  }

  return valid;
}

export type AcyclicFailureCode = 'acyclic_would_form_cycle';

export interface AcyclicCheckInput {
  readonly candidate: RelationCandidate;
  readonly relationType: RelationTypeRules;
  readonly existingRelations: readonly RelationCandidate[];
}

/** 禁環檢查：自被指端出發沿同型別關聯查可達性，可達持有端即中止。 */
export function checkAcyclicConstraint(
  input: AcyclicCheckInput,
): ValidationResult<AcyclicFailureCode> {
  if (!input.relationType.acyclic) {
    return valid;
  }

  const sameType = input.existingRelations.filter(
    (relation) => relation.relationTypeId === input.candidate.relationTypeId,
  );

  // 自被指端出發做深度優先走訪；含零步，故被指端自身先進堆疊。
  const pending: string[] = [input.candidate.toIssueId];
  const visited = new Set<string>();
  let reachesHolder = false;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (current === input.candidate.fromIssueId) {
      reachesHolder = true;
      break;
    }

    for (const relation of sameType) {
      if (relation.fromIssueId === current && !visited.has(relation.toIssueId)) {
        pending.push(relation.toIssueId);
      }
    }
  }

  if (reachesHolder) {
    return invalid('acyclic_would_form_cycle', '寫入後會成環');
  }

  return valid;
}

export type IssueSetBoundaryFailureCode =
  | 'children_crosses_issue_set'
  | 'issue_location_unknown';

export interface IssueSetBoundaryCheckInput {
  readonly candidate: RelationCandidate;
  readonly relationType: RelationTypeRules;
  /** 兩端工單的所屬工單集；只需涵蓋候選關聯的兩端。 */
  readonly issues: readonly IssueLocation[];
}

/** 母子邊界檢查：Children 的持有端與被指端必須同屬一個工單集。 */
export function checkIssueSetBoundary(
  input: IssueSetBoundaryCheckInput,
): ValidationResult<IssueSetBoundaryFailureCode> {
  if (input.relationType.name !== CHILDREN_RELATION_TYPE_NAME) {
    return valid;
  }

  const from = input.issues.find((issue) => issue.id === input.candidate.fromIssueId);
  const to = input.issues.find((issue) => issue.id === input.candidate.toIssueId);

  if (from === undefined || to === undefined) {
    return invalid('issue_location_unknown', '兩端工單的所屬工單集不明，無法判定母子邊界');
  }

  if (from.issueSetId !== to.issueSetId) {
    return invalid('children_crosses_issue_set', '母子鏈不得跨工單集');
  }

  return valid;
}

export type RelationCreationFailureCode =
  | ExclusiveFailureCode
  | AcyclicFailureCode
  | IssueSetBoundaryFailureCode;

export interface RelationCreationInput
  extends ExclusiveCheckInput,
    AcyclicCheckInput,
    IssueSetBoundaryCheckInput {}

/** createRelation 的寫入前總檢查，依 Spec 順序逐項檢查，任一失敗即中止。 */
export function validateRelationCreation(
  input: RelationCreationInput,
): ValidationResult<RelationCreationFailureCode> {
  const exclusiveResult = checkExclusiveConstraint(input);
  if (!exclusiveResult.ok) {
    return exclusiveResult;
  }

  const acyclicResult = checkAcyclicConstraint(input);
  if (!acyclicResult.ok) {
    return acyclicResult;
  }

  return checkIssueSetBoundary(input);
}
