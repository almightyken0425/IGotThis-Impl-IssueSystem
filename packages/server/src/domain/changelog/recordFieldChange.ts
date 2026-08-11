// 寫入欄位異動的判斷。
//
// 對應 Spec：ChangelogLogic 的 recordFieldChange。
// 追蹤開關為真且新舊值真的不同的欄位，各自產生一筆 ChangeLog 記錄。

import type { ChangeLogEntry, FieldChangeInput, RecordFieldChangeInput } from './types.js';

function isTracked(change: FieldChangeInput, trackedNames: ReadonlySet<string>): boolean {
  return trackedNames.has(change.fieldName);
}

/** 依 spec：追蹤開關為假則不記；新值等於舊值不算真異動，同樣不記。 */
export function recordFieldChange(input: RecordFieldChangeInput): readonly ChangeLogEntry[] {
  const trackedNames = new Set(
    input.fieldDefs.filter((def) => def.tracked).map((def) => def.name),
  );

  return input.changes
    .filter((change) => isTracked(change, trackedNames))
    .filter((change) => change.newValue !== change.oldValue)
    .map((change) => ({
      fieldName: change.fieldName,
      oldValue: change.oldValue,
      newValue: change.newValue,
      actor: input.actor,
      time: input.now,
    }));
}
