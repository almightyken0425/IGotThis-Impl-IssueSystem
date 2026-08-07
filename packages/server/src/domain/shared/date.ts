// 日期原語。
//
// 對應 Spec 值型別原語的日期，不含時間部分。
// 日期是跨 domain 的值型別，不專屬彙總，故落共用層。
// 純計算：不讀時鐘，當下日期由呼叫端注入。

import { DomainError } from './domainError.js';

/** 日期字串，格式 `YYYY-MM-DD`。 */
export type IsoDate = string;

/** 星期代碼，對應 `CalendarDefinitions.weeklyOff` 記的每週固定休息日。 */
export type WeekdayCode = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

export type DateErrorCode = 'INVALID_DATE';

/** 日期字串格式或值不合法。 */
export class DateError extends DomainError<DateErrorCode> {}

const WEEKDAY_CODES: readonly WeekdayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const MS_PER_DAY = 86_400_000;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 兩日期相隔的日曆天，未設定日曆時的天數退路。
 *
 * 區間不含起日、含迄日；迄日早於起日時回傳負值。
 */
export function differenceInCalendarDays(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** 該日期是星期幾。 */
export function weekdayOf(date: IsoDate): WeekdayCode {
  const weekday = WEEKDAY_CODES[new Date(toEpochDay(date) * MS_PER_DAY).getUTCDay()];

  /* v8 ignore next 3 -- getUTCDay 值域恆為 0 至 6，取不到才是執行環境壞了 */
  if (weekday === undefined) {
    throw new DateError('INVALID_DATE', `日期 ${date} 取不到星期`);
  }

  return weekday;
}

/** 日期字串轉 Unix epoch 起算的天數；格式與月日範圍不合即擲錯。 */
export function toEpochDay(date: IsoDate): number {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new DateError('INVALID_DATE', `日期 ${date} 不合 YYYY-MM-DD 格式`);
  }

  const parsed = Date.parse(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsed) || toIsoDate(parsed / MS_PER_DAY) !== date) {
    throw new DateError('INVALID_DATE', `日期 ${date} 不是有效日期`);
  }

  return parsed / MS_PER_DAY;
}

/** Unix epoch 起算的天數轉日期字串。 */
export function toIsoDate(epochDay: number): IsoDate {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}
