import type { Pool, PoolClient, QueryResultRow } from 'pg';

// repository 共用的查詢執行器。
//
// 邊界：repository 方法一律收一個 Executor，預設打連線池。
// Pool 與 PoolClient 都滿足 `{ query }`，同一組 repository 方法因此
// 既能各自打池、也能被呼叫端塞進同一交易的 client 內串起來執行；
// 整合測試就是靠傳入交易 client、跑完 ROLLBACK 達成隔離。

/** 能執行參數化查詢的對象：連線池或交易中的連線。 */
export type Executor = Pool | PoolClient;

/** 查詢並回傳 row 陣列；參數一律走佔位符防注入。 */
export async function run<T extends QueryResultRow>(
  exec: Executor,
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await exec.query<T>(text, params as unknown[]);
  return result.rows;
}

/** 單列查詢；查無回 undefined。 */
export async function runOne<T extends QueryResultRow>(
  exec: Executor,
  text: string,
  params: readonly unknown[] = [],
): Promise<T | undefined> {
  const rows = await run<T>(exec, text, params);
  return rows[0];
}
