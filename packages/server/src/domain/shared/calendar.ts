// 工作日曆天數計算。
//
// 日曆只影響派生的天數，不影響儲存的起訖日。
// 兩處要用：彙總的偏離天數，與檢視層的工期天數，故落共用層、不歸任一 domain。
// 純函式：週規則與例外清單由呼叫端以參數帶入，不在此讀取定義區。

import type { IsoDate, WeekdayCode } from './date.js';
import { toEpochDay, toIsoDate, weekdayOf } from './date.js';

/** 天數單位；有生效日曆時計工作天，無日曆時退回日曆天。 */
export type DayUnit = 'workingDay' | 'calendarDay';

/** `CalendarExceptions` 子集；日曆已解析，不再帶 `calendarName`。 */
export interface CalendarException {
  date: IsoDate;
  /** 真代表該日由假日改為工作日，用於補班日；假代表由工作日改為假日。 */
  isWorking: boolean;
}

/** 解析後的一份日曆：`CalendarDefinitions` 一列，加上它的例外清單。 */
export interface WorkCalendar {
  companyId: string;
  name: string;
  weeklyOff: WeekdayCode[];
  exceptions: CalendarException[];
}

/** 該日是否為工作日；例外逐日雙向覆寫週規則。 */
export function isWorkingDay(calendar: WorkCalendar, date: IsoDate): boolean {
  const exception = calendar.exceptions.find((row) => row.date === date);

  if (exception !== undefined) {
    return exception.isWorking;
  }

  return !calendar.weeklyOff.includes(weekdayOf(date));
}

/**
 * 兩日期相隔的工作天，扣除週休與例外假日。
 *
 * 區間不含起日、含迄日；迄日早於起日時回傳負值。
 */
export function differenceInWorkingDays(
  calendar: WorkCalendar,
  from: IsoDate,
  to: IsoDate,
): number {
  const start = toEpochDay(from);
  const end = toEpochDay(to);
  const sign = end < start ? -1 : 1;
  const [earlier, later] = sign === 1 ? [start, end] : [end, start];

  let workingDays = 0;
  for (let epochDay = earlier + 1; epochDay <= later; epochDay += 1) {
    if (isWorkingDay(calendar, toIsoDate(epochDay))) {
      workingDays += 1;
    }
  }

  return workingDays * sign;
}
