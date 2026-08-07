import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { getPool } from './pool.js';

// 型別安全的查詢包裝。
// 邊界：呼叫端宣告 row 形狀，本層只回純資料陣列，不外流 driver 的 QueryResult 物件。

/** 查詢並回傳 row 陣列；SQL 與參數分離，參數一律走佔位符防注入。 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  pool: Pool = getPool(),
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown[]);
  return result.rows;
}

/** 單列查詢；查無回 undefined。 */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  pool: Pool = getPool(),
): Promise<T | undefined> {
  const rows = await query<T>(text, params, pool);
  return rows[0];
}

/** 交易邊界：callback 內共用同一連線，正常路徑 COMMIT、拋錯 ROLLBACK。 */
export async function withTransaction<T>(
  fn: (tx: PoolClient) => Promise<T>,
  pool: Pool = getPool(),
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
