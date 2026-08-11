import type { AccountCalendarSetting, ViewCalendarSetting } from './types.js';

// 決定檢視的天數計算採用哪一份日曆。
//
// 對應 spec: ViewLogic / resolveViewCalendar。
// 只決定生效日曆的「名稱」；查出對應的 CalendarDefinitions 屬於 IO，交呼叫端負責。

/**
 * 決定檢視採用的日曆名稱：檢視自身的選用優先，其次帳號預設，皆無則回 null。
 * 回 null 時，天數計算退回日曆天。
 */
export function resolveViewCalendar(
  view: ViewCalendarSetting,
  account: AccountCalendarSetting,
): string | null {
  return view.calendarName ?? account.defaultCalendarName ?? null;
}
