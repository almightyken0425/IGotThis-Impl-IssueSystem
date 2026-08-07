import { Pool, type PoolClient } from 'pg';

import { loadEnv } from './env.js';
import { applyMigrations } from './migrate.js';

// 整合測試共用的 DB 鷹架，單一真相。
//
// - 連 igotthis_test；無 TEST_DATABASE_URL 時整組整合測試略過（hasTestDb 收斂此判斷）。
// - schema 套用走 migration runner，可重入、序列執行下安全。
// - 隔離策略：每個 case 在交易內跑、跑完一律 ROLLBACK，測試間不互相汙染；
//   需真正跨連線提交的 case（如併發取號）例外，該 case 自備清理。
//
// repositories/ 的 testSupport 與 testFixtures、db/schema.test 皆自此取用，不各自重刻。

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];

/** 有 TEST_DATABASE_URL 才跑整合測試，否則整組略過。 */
export const hasTestDb = Boolean(testUrl);

/** 建測試庫連線池並確保 schema 已套用。 */
export async function makeTestPool(): Promise<Pool> {
  if (!testUrl) throw new Error('TEST_DATABASE_URL 未設定');
  const pool = new Pool({ connectionString: testUrl });
  await applyMigrations(pool);
  return pool;
}

/**
 * 在交易內執行 fn 後強制 ROLLBACK，達成 case 間隔離。
 * fn 收到的 client 即該交易連線，repository 方法把它當 Executor 傳入。
 */
export async function withRollback(
  pool: Pool,
  fn: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
