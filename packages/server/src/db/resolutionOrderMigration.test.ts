import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';
import { applyMigrations } from './migrate.js';
import { listResolutionOptions } from './repositories/issueRepo.js';

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];
const suite = testUrl ? describe : describe.skip;
const historicalMigrations = [
  '001_init_schema.sql',
  '002_auth.sql',
  '003_defer_workflow_transition_fks.sql',
  '004_resolution_options_sort_order.sql',
] as const;

suite('結案原因排序升級', () => {
  let pool: Pool;
  let companyId: string;
  let issueTypeId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: testUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_on bigint NOT NULL)');
    for (const name of historicalMigrations) {
      await pool.query(await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'));
      await pool.query('INSERT INTO schema_migrations VALUES ($1, $2)', [name, 0]);
    }
    companyId = randomUUID();
    issueTypeId = randomUUID();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [companyId, 'Upgrade']);
    await pool.query(
      'INSERT INTO issue_type_definitions (id, company_id, name, label, field_sets, system) VALUES ($1, $2, $3, $4, $5, $6)',
      [issueTypeId, companyId, 'task', 'Task', '[]', false],
    );
  });

  it('已套用舊版遷移的全零選項保留原顯示順序並取得不同位置', async () => {
    for (const value of ['Zulu', 'Alpha', 'Mike']) {
      await pool.query(
        'INSERT INTO resolution_options (company_id, issue_type_id, value, system) VALUES ($1, $2, $3, $4)',
        [companyId, issueTypeId, value, false],
      );
    }

    await applyMigrations(pool);

    const options = await listResolutionOptions(companyId, issueTypeId, pool);
    expect(options.map(({ value, sortOrder }) => ({ value, sortOrder }))).toEqual([
      { value: 'Alpha', sortOrder: 1 },
      { value: 'Mike', sortOrder: 2 },
      { value: 'Zulu', sortOrder: 3 },
    ]);
  });

  it('升級保留舊版已儲存的自訂相對順序與旗標', async () => {
    await pool.query(
      `INSERT INTO resolution_options (company_id, issue_type_id, value, sort_order, system)
       VALUES ($1, $2, 'Alpha', 1, false), ($1, $2, 'Zulu', 0, true)`,
      [companyId, issueTypeId],
    );

    await applyMigrations(pool);

    const options = await listResolutionOptions(companyId, issueTypeId, pool);
    expect(options.map(({ value, sortOrder, system }) => ({ value, sortOrder, system }))).toEqual([
      { value: 'Zulu', sortOrder: 1, system: true },
      { value: 'Alpha', sortOrder: 2, system: false },
    ]);
  });

  it('不同公司與型別的排序各自起算且重跑升級不改已儲存順序', async () => {
    const otherTypeId = randomUUID();
    const otherCompanyId = randomUUID();
    const foreignTypeId = randomUUID();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [otherCompanyId, 'Other']);
    await pool.query(
      `INSERT INTO issue_type_definitions (id, company_id, name, label, field_sets, system)
       VALUES ($1, $2, 'other', 'Other', '[]', false), ($3, $4, 'task', 'Task', '[]', false)`,
      [otherTypeId, companyId, foreignTypeId, otherCompanyId],
    );
    await pool.query(
      `INSERT INTO resolution_options (company_id, issue_type_id, value, sort_order, system)
       VALUES ($1, $2, 'Zulu', 0, false), ($1, $2, 'Alpha', 0, false),
              ($1, $3, 'Zulu', 0, false), ($4, $5, 'Alpha', 0, false)`,
      [companyId, issueTypeId, otherTypeId, otherCompanyId, foreignTypeId],
    );

    await applyMigrations(pool);
    expect(await applyMigrations(pool)).toEqual([]);

    const readPositions = async (company: string, type: string) =>
      (await listResolutionOptions(company, type, pool)).map(({ value, sortOrder }) => ({ value, sortOrder }));
    expect(await readPositions(companyId, issueTypeId)).toEqual([
      { value: 'Alpha', sortOrder: 1 },
      { value: 'Zulu', sortOrder: 2 },
    ]);
    expect(await readPositions(companyId, otherTypeId)).toEqual([{ value: 'Zulu', sortOrder: 1 }]);
    expect(await readPositions(otherCompanyId, foreignTypeId)).toEqual([{ value: 'Alpha', sortOrder: 1 }]);
  });
});
