// domain 共用層。
//
// 收容不屬於任何單一 domain、卻被兩個以上 domain 需要的東西：
// - 檢查結果與擲錯的共同形狀，讓 api 層以同一組判斷處理所有 domain 的失敗
// - 日期原語與工作日曆，Spec 的彙總偏離與檢視工期兩處都要
//
// 準入門檻：真的被兩個以上 domain 用到才進來。
// 只有一個 domain 用得到的東西留在該 domain 內，共用層不當雜物間。
// 依賴方向：各 domain 依賴共用層，共用層不反向依賴任何 domain。

export { DomainError } from './domainError.js';

export { invalid, valid } from './result.js';
export type { ValidationFailure, ValidationOk, ValidationResult } from './result.js';

export { DateError, differenceInCalendarDays, toEpochDay, toIsoDate, weekdayOf } from './date.js';
export type { DateErrorCode, IsoDate, WeekdayCode } from './date.js';

export { differenceInWorkingDays, isWorkingDay } from './calendar.js';
export type { CalendarException, DayUnit, WorkCalendar } from './calendar.js';
