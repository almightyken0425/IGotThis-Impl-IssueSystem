import { initializeRollupMode } from './initializeRollupMode.js';
import { findFieldValueRow, findSubordinateIds, requireRollupFn } from './snapshot.js';
import type { RollupMode, RollupSnapshot } from './types.js';
import { WORK_LOG_FIELD_NAME } from './types.js';

/**
 * 判定生效模式：可彙總欄位當下依自動或手動運作。
 *
 * 三段判定有先後：葉節點勝過工時規則，工時規則勝過欄位記的模式。
 */
export function resolveEffectiveMode(
  snapshot: RollupSnapshot,
  issueId: string,
  fieldName: string,
): RollupMode {
  requireRollupFn(snapshot, fieldName);

  // 葉節點沒有下級可彙總，`IssueFieldValues.rollupMode` 記什麼都不適用。
  if (findSubordinateIds(snapshot, issueId).length === 0) {
    return 'manual';
  }

  // 工時由執行者填報，持有端手填無意義。
  if (fieldName === WORK_LOG_FIELD_NAME) {
    return 'auto';
  }

  return (
    findFieldValueRow(snapshot, issueId, fieldName)?.rollupMode ??
    initializeRollupMode(snapshot, issueId, fieldName)
  );
}
