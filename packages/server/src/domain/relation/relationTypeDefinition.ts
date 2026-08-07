// 關聯型別定義的組合檢查與刪除守門。
//
// 對應 Spec：RelationIntegrityLogic 的 writeRelationTypeDefinition。

import type { ValidationResult } from '../shared/index.js';
import { invalid, valid } from '../shared/index.js';
import type { RelationTypeDefinition, RelationTypeSwitches } from './types.js';

export type RelationTypeDefinitionFailureCode =
  | 'symmetric_forbids_exclusive_and_ordered'
  | 'rollup_requires_exclusive_and_acyclic';

/** 寫入關聯型別定義前的開關組合檢查。危險組合由組合檢查擋下，不由權限擋。 */
export function validateRelationTypeDefinition(
  switches: RelationTypeSwitches,
): ValidationResult<RelationTypeDefinitionFailureCode> {
  if (switches.symmetric && (switches.exclusive || switches.ordered)) {
    return invalid(
      'symmetric_forbids_exclusive_and_ordered',
      '對稱即無持有端，唯一與排序皆無基準',
    );
  }

  if (switches.rollup && (!switches.exclusive || !switches.acyclic)) {
    return invalid('rollup_requires_exclusive_and_acyclic', '非獨佔會重複計算，有環會無限遞迴');
  }

  return valid;
}

export type RelationTypeDeletionFailureCode = 'system_relation_type_not_deletable';

/** 刪除關聯型別定義前的守門。內建四關聯不可刪除。 */
export function validateRelationTypeDeletion(
  definition: Pick<RelationTypeDefinition, 'system'>,
): ValidationResult<RelationTypeDeletionFailureCode> {
  if (definition.system) {
    return invalid('system_relation_type_not_deletable', '內建關聯型別不可刪除');
  }

  return valid;
}
