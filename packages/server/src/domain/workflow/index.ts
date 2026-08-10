// 狀態流程 domain。
//
// 對應 spec 的 Logic 層狀態流程邏輯。
// 承載範圍：一次狀態轉換的合法性檢查與變更決定。
//
// 全部為純函式，資料由呼叫端以參數傳入，不碰資料庫。

export * from './types.js';
export * from './validateStatusTransition.js';
export * from './changeIssueStatus.js';
