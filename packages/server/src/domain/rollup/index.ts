// 彙總 domain。
//
// 對應 spec 的 Logic 層彙總邏輯。
// 承載範圍：
// - 沿彙總開關為真的關聯型別收集下級工單後計算彙總值
// - 四個可彙總欄位的算法：起始取最早、結束取最晚、點數與工時取加總
// - 自動與手動兩模式的判定、初值與切換
// - 下級異動時向上逐層重算，與手動模式的偏離標示
//
// 六個行為皆為純函式：資料由呼叫端以快照帶入，計算結果由呼叫端負責寫入。

export { computeRollupValue } from './computeRollupValue.js';
export { resolveEffectiveMode } from './resolveEffectiveMode.js';
export { initializeRollupMode } from './initializeRollupMode.js';
export { switchRollupMode } from './switchRollupMode.js';
export type {
  RollupModeSwitch,
  RollupModeSwitchRejected,
  SwitchRollupModeResult,
} from './switchRollupMode.js';
export { refreshAutoRollup } from './refreshAutoRollup.js';
export type { RollupUpdate } from './refreshAutoRollup.js';
export { evaluateDeviation } from './evaluateDeviation.js';
export type { Deviated, Deviation, DeviationUnit, NoDeviation } from './evaluateDeviation.js';
export {
  findFieldValueRow,
  findHolderIds,
  findSubordinateIds,
  requireRollupFn,
  sumFieldRecords,
  withFieldValue,
} from './snapshot.js';
export { RollupError, WORK_LOG_FIELD_NAME } from './types.js';
export type {
  FieldDef,
  IssueFieldRecord,
  IssueFieldValue,
  RollupErrorCode,
  RollupFieldValue,
  RollupFn,
  RollupMode,
  RollupRelation,
  RollupRelationType,
  RollupSnapshot,
  RollupValue,
  RollupableFieldName,
} from './types.js';
