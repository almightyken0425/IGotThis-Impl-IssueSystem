import { realpathSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

import { loadEnv } from './env.js';

// 前向式 migration runner。
// migrations/*.sql 依檔名排序套用，套過的記在 schema_migrations；
// 每檔在單一交易內執行 + 記錄，中途失敗整檔回滾。

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

interface MigrationRow {
  name: string;
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_on bigint NOT NULL
    )
  `);
}

async function appliedNames(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<MigrationRow>('SELECT name FROM schema_migrations');
  return new Set(result.rows.map((row) => row.name));
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

/**
 * 對指定連線池套用所有未套的 migration，回傳本次實際套用的檔名清單。
 * 已套過的自動略過，可安全重跑。
 */
export async function applyMigrations(pool: Pool): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const already = await appliedNames(pool);
  const files = await listMigrationFiles();
  const appliedThisRun: string[] = [];

  for (const file of files) {
    if (already.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, applied_on) VALUES ($1, $2)', [
        file,
        Date.now(),
      ]);
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    appliedThisRun.push(file);
  }

  return appliedThisRun;
}

/** CLI 進入點：--test 打 TEST_DATABASE_URL，否則打 DATABASE_URL。 */
async function runCli(): Promise<void> {
  loadEnv();
  const useTest = process.argv.includes('--test');
  const key = useTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const url = process.env[key];
  if (!url) throw new Error(`${key} 未設定，無法執行 migration`);

  const pool = new Pool({ connectionString: url });
  try {
    const applied = await applyMigrations(pool);
    if (applied.length === 0) {
      console.log(`[migrate] ${key}：無待套 migration，schema 已最新`);
    } else {
      console.log(`[migrate] ${key}：套用 ${applied.length} 個 migration`);
      for (const name of applied) console.log(`  + ${name}`);
    }
  } finally {
    await pool.end();
  }
}

// 僅在被直接執行時跑 CLI；被 import（測試）時只暴露 applyMigrations。
const entry = process.argv[1];
if (entry && realpathSync(entry) === fileURLToPath(import.meta.url)) {
  await runCli();
}
