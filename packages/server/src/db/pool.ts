import { Pool, type PoolConfig } from 'pg';

import { loadEnv } from './env.js';

// PostgreSQL 連線池。
// 邊界：連線字串由組裝根或測試注入，本層只認 DATABASE_URL；
// domain 不 import 本層，依賴方向單向由外向內。

/** 以指定連線字串建一個獨立連線池；測試庫、腳本用得到。 */
export function createPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  return new Pool({ connectionString, ...overrides });
}

let defaultPool: Pool | undefined;

/** 取預設連線池；首次呼叫時以 DATABASE_URL 建立單例。 */
export function getPool(): Pool {
  if (!defaultPool) {
    loadEnv();
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL 未設定，無法建立連線池');
    defaultPool = createPool(url);
  }
  return defaultPool;
}

/** 優雅關閉預設連線池；等待進行中的查詢排空後釋放連線。 */
export async function closePool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.end();
    defaultPool = undefined;
  }
}

/** 綁定 SIGINT / SIGTERM，收到終止訊號時先關池再退出。 */
export function registerGracefulShutdown(): void {
  const shutdown = (): void => {
    void closePool().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
