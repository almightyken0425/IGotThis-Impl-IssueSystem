import type { IsoDate, WorkCalendar } from '../shared/index.js';
import { differenceInCalendarDays, differenceInWorkingDays } from '../shared/index.js';

import type { IssueDuration } from './types.js';

// 計算工單起訖區間的工期天數。
//
// 對應 spec: ViewLogic / computeIssueDuration。
// 生效日曆由呼叫端決定（見 resolveViewCalendar）並帶入，本函式不查日曆定義。

/**
 * 起訖日任一缺即無工期可算；兩者皆有時，依有無生效日曆決定計數單位。
 */
export function computeIssueDuration(
  start: IsoDate | null,
  end: IsoDate | null,
  calendar: WorkCalendar | null,
): IssueDuration {
  if (start === null || end === null) {
    return { hasDuration: false };
  }

  if (calendar === null) {
    return { hasDuration: true, days: differenceInCalendarDays(start, end), unit: 'calendarDay' };
  }

  return {
    hasDuration: true,
    days: differenceInWorkingDays(calendar, start, end),
    unit: 'workingDay',
  };
}
