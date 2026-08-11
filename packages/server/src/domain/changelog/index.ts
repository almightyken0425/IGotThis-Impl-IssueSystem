// 變更歷史 domain。
//
// 對應 spec 的 Logic 層變更歷史邏輯。
// 承載範圍：欄位異動要不要記錄的判斷，與以歷史重放重建任一時點欄位狀態。
//
// 全部為純函式，資料由呼叫端以參數傳入，不碰資料庫。

export * from './types.js';
export * from './recordFieldChange.js';
export * from './rebuildFieldStateAt.js';
