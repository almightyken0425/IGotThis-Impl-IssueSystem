// 資料存取層匯出口。
//
// 角色：PostgreSQL 連線池、交易邊界、schema migration、repository。
// 邊界：
// - 唯一允許碰資料庫的一層，SQL 不外流到 api 或 domain
// - 對外只吐純資料結構，不吐 driver 的 row 物件
// - 交易邊界由本層開關，api 只宣告要不要在同一交易內
// - domain 不得 import 本層，依賴方向單向由外向內
//
export { createPool, getPool, closePool, registerGracefulShutdown } from './pool.js';
export { query, queryOne, withTransaction } from './client.js';
export { applyMigrations } from './migrate.js';

// 各聚合的 repository：手寫 SQL、對映 snake_case 欄名到 domain 的 camelCase。
export * from './repositories/index.js';
