import { computeRollupValue } from './computeRollupValue.js';
import { resolveEffectiveMode } from './resolveEffectiveMode.js';
import {
  findFieldValueRow,
  findHolderIds,
  requireRollupFn,
  withFieldValue,
} from './snapshot.js';
import type { RollupSnapshot, RollupValue } from './types.js';
import { RollupError } from './types.js';

/** 一筆該落到持有端 `IssueFieldValues` 的主值更新；由呼叫端負責寫入。 */
export interface RollupUpdate {
  issueId: string;
  fieldName: string;
  value: RollupValue;
}

/**
 * 下級異動重算：維護持有端的自動模式主值。
 *
 * 純計算，回傳由下而上的更新清單，不自行寫入。
 * 手動模式的持有端不覆蓋主值，偏離標示由 `evaluateDeviation` 承擔。
 */
export function refreshAutoRollup(
  snapshot: RollupSnapshot,
  changedIssueId: string,
  fieldName: string,
): RollupUpdate[] {
  requireRollupFn(snapshot, fieldName);

  const updates: RollupUpdate[] = [];
  propagateUpward(snapshot, changedIssueId, fieldName, updates, new Set([changedIssueId]));

  return updates;
}

/**
 * 沿持有端方向往上重算，並把剛算出的值套進工作快照。
 *
 * 主值沒變就停：上層讀的是這一層的主值，這一層沒動、上層算出來也不會動。
 */
function propagateUpward(
  snapshot: RollupSnapshot,
  issueId: string,
  fieldName: string,
  updates: RollupUpdate[],
  visited: Set<string>,
): RollupSnapshot {
  let working = snapshot;

  for (const holderId of findHolderIds(working, issueId)) {
    if (visited.has(holderId)) {
      throw new RollupError('RELATION_CYCLE', `工單 ${holderId} 的彙總關聯成環`);
    }

    if (resolveEffectiveMode(working, holderId, fieldName) !== 'auto') {
      continue;
    }

    const value = computeRollupValue(working, holderId, fieldName);
    const current = findFieldValueRow(working, holderId, fieldName)?.value ?? null;

    if (value === current) {
      continue;
    }

    updates.push({ issueId: holderId, fieldName, value });
    working = withFieldValue(working, holderId, fieldName, value);
    working = propagateUpward(
      working,
      holderId,
      fieldName,
      updates,
      new Set(visited).add(holderId),
    );
  }

  return working;
}
