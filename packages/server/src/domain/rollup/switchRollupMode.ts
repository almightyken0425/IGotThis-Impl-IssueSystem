import type { ValidationFailure } from '../shared/index.js';
import { invalid } from '../shared/index.js';
import { computeRollupValue } from './computeRollupValue.js';
import { findFieldValueRow, requireRollupFn } from './snapshot.js';
import type { RollupMode, RollupSnapshot, RollupValue } from './types.js';
import { WORK_LOG_FIELD_NAME } from './types.js';

/** 切換成功時該落到 `IssueFieldValues` 的狀態；由呼叫端負責寫入。 */
export interface RollupModeSwitch {
  ok: true;
  issueId: string;
  fieldName: string;
  rollupMode: RollupMode;
  /** 切換後的欄位主值；切 auto 時為彙總值，切 manual 時維持現值。 */
  value: RollupValue;
  /** 欄位是否轉唯讀；auto 唯讀、manual 開放人工編輯。 */
  readonly: boolean;
}

/** 工時恆為 auto，不開放切換；形狀沿用共用層的檢查失敗。 */
export type RollupModeSwitchRejected = ValidationFailure<'WORKLOG_MODE_LOCKED'>;

export type SwitchRollupModeResult = RollupModeSwitch | RollupModeSwitchRejected;

/**
 * 切換彙總模式：使用者隨時可在 auto 與 manual 之間切換。
 *
 * 純計算，回傳該落地的狀態，不自行寫入。
 * 切回 auto 時原手動值不保留——保留會讓唯讀欄位顯示一個沒有來源的數字。
 */
export function switchRollupMode(
  snapshot: RollupSnapshot,
  issueId: string,
  fieldName: string,
  targetMode: RollupMode,
): SwitchRollupModeResult {
  requireRollupFn(snapshot, fieldName);

  if (fieldName === WORK_LOG_FIELD_NAME) {
    return invalid('WORKLOG_MODE_LOCKED', '工時由執行者填報，模式恆為自動，不開放切換');
  }

  if (targetMode === 'auto') {
    return {
      ok: true,
      issueId,
      fieldName,
      rollupMode: 'auto',
      value: computeRollupValue(snapshot, issueId, fieldName),
      readonly: true,
    };
  }

  return {
    ok: true,
    issueId,
    fieldName,
    rollupMode: 'manual',
    value: findFieldValueRow(snapshot, issueId, fieldName)?.value ?? null,
    readonly: false,
  };
}
