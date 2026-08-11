// domain 層匯出口。
//
// 角色：工單系統的 core logic 落點，對應 spec 的 Logic 層。
// 硬性約束：
// - 純函式，不做任何 IO，不碰資料庫、檔案系統、網路、時鐘、亂數
// - 需要當下時間或識別碼時由呼叫端注入，不在 domain 內取得
// - 只依賴同層型別，不 import db、api、auth 任一模組
// - 全面 TDD，測試先行，測試檔與被測檔同目錄
//
// 反向依賴方向：api 與 db 依賴 domain，domain 不依賴任何人。
// 層內方向：各 domain 依賴 shared，shared 不反向依賴任何 domain；
// domain 之間只允許取型別投影，不互相呼叫行為。

export * from './shared/index.js';
export * from './relation/index.js';
export * from './rollup/index.js';
export * from './numbering/index.js';
export * from './view/index.js';
export * from './workflow/index.js';
export * from './changelog/index.js';
