import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadEnv } from '../env.js';
import { applyMigrations } from '../migrate.js';

import {
  deleteCalendarException,
  getCalendar,
  insertCalendarDefinition,
  listCalendarExceptions,
  listCalendars,
  updateCalendarWeeklyOff,
  upsertCalendarException,
} from './calendarRepo.js';
import { seedCompany, withRollback } from './testFixtures.js';

// calendarRepo 整合測試：連 igotthis_test，每個 case 交易 rollback 隔離。
// 無 TEST_DATABASE_URL 時整組略過。

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];
const suite = testUrl ? describe : describe.skip;

suite('calendarRepo / 整合', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl });
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await applyMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('寫入定義後可取回，weeklyOff 原樣還原', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      await insertCalendarDefinition(client, {
        companyId,
        name: '台灣',
        weeklyOff: ['SAT', 'SUN'],
      });

      const calendar = await getCalendar(client, companyId, '台灣');
      expect(calendar).toBeDefined();
      expect(calendar?.weeklyOff).toEqual(['SAT', 'SUN']);
      expect(calendar?.exceptions).toEqual([]);
    });
  });

  it('例外可寫入、覆寫、刪除，並依日期升冪列出', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      await insertCalendarDefinition(client, { companyId, name: '台灣', weeklyOff: ['SUN'] });

      // 國定假日
      await upsertCalendarException(client, companyId, '台灣', {
        date: '2026-01-01',
        isWorking: false,
      });
      // 補班日
      await upsertCalendarException(client, companyId, '台灣', {
        date: '2025-12-27',
        isWorking: true,
      });

      let exceptions = await listCalendarExceptions(client, companyId, '台灣');
      expect(exceptions).toEqual([
        { date: '2025-12-27', isWorking: true },
        { date: '2026-01-01', isWorking: false },
      ]);

      // 同日覆寫：方向由 false 改 true
      await upsertCalendarException(client, companyId, '台灣', {
        date: '2026-01-01',
        isWorking: true,
      });
      exceptions = await listCalendarExceptions(client, companyId, '台灣');
      expect(exceptions.find((e) => e.date === '2026-01-01')?.isWorking).toBe(true);
      expect(exceptions).toHaveLength(2);

      // 刪除
      await deleteCalendarException(client, companyId, '台灣', '2026-01-01');
      exceptions = await listCalendarExceptions(client, companyId, '台灣');
      expect(exceptions).toEqual([{ date: '2025-12-27', isWorking: true }]);
    });
  });

  it('getCalendar 組出定義加例外的完整 WorkCalendar', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      await insertCalendarDefinition(client, { companyId, name: '日本', weeklyOff: ['SAT', 'SUN'] });
      await upsertCalendarException(client, companyId, '日本', {
        date: '2026-05-04',
        isWorking: false,
      });

      const calendar = await getCalendar(client, companyId, '日本');
      expect(calendar).toEqual({
        companyId,
        name: '日本',
        weeklyOff: ['SAT', 'SUN'],
        exceptions: [{ date: '2026-05-04', isWorking: false }],
      });
    });
  });

  it('updateCalendarWeeklyOff 改寫週規則', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      await insertCalendarDefinition(client, { companyId, name: '台灣', weeklyOff: ['SUN'] });
      await updateCalendarWeeklyOff(client, companyId, '台灣', ['SAT', 'SUN']);

      const calendar = await getCalendar(client, companyId, '台灣');
      expect(calendar?.weeklyOff).toEqual(['SAT', 'SUN']);
    });
  });

  it('租戶隔離：另一 Company 看不到本 Company 的日曆', async () => {
    await withRollback(pool, async (client) => {
      const companyA = await seedCompany(client, 'A');
      const companyB = await seedCompany(client, 'B');
      await insertCalendarDefinition(client, { companyId: companyA, name: '台灣', weeklyOff: ['SUN'] });

      expect(await getCalendar(client, companyB, '台灣')).toBeUndefined();
      expect(await listCalendars(client, companyB)).toEqual([]);
      expect(await listCalendars(client, companyA)).toHaveLength(1);
    });
  });
});
