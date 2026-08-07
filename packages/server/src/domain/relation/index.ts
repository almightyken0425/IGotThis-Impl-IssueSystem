// 關聯完整性 domain。
//
// 對應 spec 的 Logic 層關聯完整性邏輯。
// 承載範圍：
// - 關聯型別定義的旗標組合檢查，與內建型別的刪除守門
// - 建立關聯時的獨佔、禁環、母子邊界三項約束判定
// - 由母子結構衍生的工單層級計算
//
// 全部為純函式，資料由呼叫端以參數傳入，不碰資料庫。

export * from './types.js';
export * from './relationTypeDefinition.js';
export * from './relationIntegrity.js';
export * from './issueLevel.js';
