import type { CalendarException, WeekdayCode, WorkCalendar } from '../../domain/index.js';

import type { Executor } from './executor.js';

// 日曆 repository：CalendarDefinitions 與 CalendarExceptions 的讀寫。
// 邊界：row 的 snake_case 欄名在此轉為 domain 的 camelCase；
// 讀出的形狀直接餵 domain 的 WorkCalendar，不另立實體型別。
// 租戶鍵 company_id 為每一筆查詢的必要條件，跨 Company 不可見。

/** CalendarDefinitions 的一列。weekly_off 為 jsonb，pg 已解析為陣列。 */
interface CalendarDefinitionRow {
  company_id: string;
  name: string;
  weekly_off: WeekdayCode[];
}

/** CalendarExceptions 的一列。date 以 ::text 取回，固定 YYYY-MM-DD。 */
interface CalendarExceptionRow {
  date: string;
  is_working: boolean;
}

/** 日曆定義寫入輸入：週規則本身，例外清單另行寫入。 */
export type CalendarDefinitionInput = Omit<WorkCalendar, 'exceptions'>;

/** 寫入一份日曆定義；例外經 upsertCalendarException 另行寫入。 */
export async function insertCalendarDefinition(
  exec: Executor,
  def: CalendarDefinitionInput,
): Promise<void> {
  await exec.query(
    `INSERT INTO calendar_definitions (company_id, name, weekly_off)
     VALUES ($1, $2, $3)`,
    [def.companyId, def.name, JSON.stringify(def.weeklyOff)],
  );
}

/** 更新一份日曆的週規則。 */
export async function updateCalendarWeeklyOff(
  exec: Executor,
  companyId: string,
  name: string,
  weeklyOff: readonly WeekdayCode[],
): Promise<void> {
  await exec.query(
    `UPDATE calendar_definitions SET weekly_off = $3
     WHERE company_id = $1 AND name = $2`,
    [companyId, name, JSON.stringify(weeklyOff)],
  );
}

/** 寫入或覆寫一筆日曆例外；同一日曆同一日僅一筆，衝突時更新方向。 */
export async function upsertCalendarException(
  exec: Executor,
  companyId: string,
  calendarName: string,
  exception: CalendarException,
): Promise<void> {
  await exec.query(
    `INSERT INTO calendar_exceptions (company_id, calendar_name, date, is_working)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, calendar_name, date)
     DO UPDATE SET is_working = EXCLUDED.is_working`,
    [companyId, calendarName, exception.date, exception.isWorking],
  );
}

/** 刪除一筆日曆例外。 */
export async function deleteCalendarException(
  exec: Executor,
  companyId: string,
  calendarName: string,
  date: string,
): Promise<void> {
  await exec.query(
    `DELETE FROM calendar_exceptions
     WHERE company_id = $1 AND calendar_name = $2 AND date = $3`,
    [companyId, calendarName, date],
  );
}

/** 一份日曆的例外清單，依日期升冪。 */
export async function listCalendarExceptions(
  exec: Executor,
  companyId: string,
  calendarName: string,
): Promise<CalendarException[]> {
  const result = await exec.query<CalendarExceptionRow>(
    `SELECT date::text AS date, is_working
     FROM calendar_exceptions
     WHERE company_id = $1 AND calendar_name = $2
     ORDER BY date`,
    [companyId, calendarName],
  );
  return result.rows.map(rowToException);
}

/** 取一份完整日曆：定義加其例外清單，組成 domain 的 WorkCalendar；查無回 undefined。 */
export async function getCalendar(
  exec: Executor,
  companyId: string,
  name: string,
): Promise<WorkCalendar | undefined> {
  const defResult = await exec.query<CalendarDefinitionRow>(
    `SELECT company_id, name, weekly_off
     FROM calendar_definitions
     WHERE company_id = $1 AND name = $2`,
    [companyId, name],
  );
  const defRow = defResult.rows[0];
  if (defRow === undefined) return undefined;

  const exceptions = await listCalendarExceptions(exec, companyId, name);
  return rowToWorkCalendar(defRow, exceptions);
}

/** 一個 Company 的全部日曆，各帶其例外清單，依名稱升冪。 */
export async function listCalendars(exec: Executor, companyId: string): Promise<WorkCalendar[]> {
  const defResult = await exec.query<CalendarDefinitionRow>(
    `SELECT company_id, name, weekly_off
     FROM calendar_definitions
     WHERE company_id = $1
     ORDER BY name`,
    [companyId],
  );

  const calendars: WorkCalendar[] = [];
  for (const defRow of defResult.rows) {
    const exceptions = await listCalendarExceptions(exec, companyId, defRow.name);
    calendars.push(rowToWorkCalendar(defRow, exceptions));
  }
  return calendars;
}

function rowToException(row: CalendarExceptionRow): CalendarException {
  return { date: row.date, isWorking: row.is_working };
}

function rowToWorkCalendar(
  row: CalendarDefinitionRow,
  exceptions: CalendarException[],
): WorkCalendar {
  return {
    companyId: row.company_id,
    name: row.name,
    weeklyOff: row.weekly_off,
    exceptions,
  };
}
