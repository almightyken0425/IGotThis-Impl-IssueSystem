// 編號 domain。
//
// 對應 spec 的 Logic 層編號邏輯。
// 承載範圍：
// - 工單集 KEY 的建議值產生與字元、長度、租戶內唯一性驗證
// - 工單顯示編號的組字，即工單集 KEY 串接流水號
// - 流水號取號：於工單集內遞增，只前進，刪除的號不回收
//
// 純函式，序列狀態以參數傳入、前進後的值以回傳值交還呼叫端；
// 併發下的取號互斥由呼叫端的交易擔保，domain 不涉入。

export { assignIssueKey, formatIssueKey, takeNextSeq } from './issueKey.js';
export {
  KEY_MAX_LENGTH,
  KEY_MIN_LENGTH,
  suggestIssueSetKey,
  validateIssueSetKey,
} from './issueSetKey.js';
export { NumberingError } from './types.js';
export type {
  AssignIssueKeyResult,
  IssueSetKeyEntry,
  IssueSetKeyErrorCode,
  IssueSetNumberingState,
  IssueSetSequenceState,
  NumberingErrorCode,
  SuggestIssueSetKeyInput,
  TakeNextSeqResult,
  ValidateIssueSetKeyInput,
  ValidateIssueSetKeyResult,
} from './types.js';
