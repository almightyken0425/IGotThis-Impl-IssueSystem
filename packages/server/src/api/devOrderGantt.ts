// DevOrderScreen 甘特圖的時間軸與座標換算。
//
// 不放進 domain/：no7_view_logic.md 沒有定義任何「時間軸格子建構」或「日期換算
// 格子座標」的 Logic 函式，這是 DevOrderScreen 這個畫面的視覺投影，跟
// workspaceIssueRow.ts 是同一類。
//
// 純函式：今天日期由呼叫端（route 層）算好傳入，本檔不碰時鐘。

import { isWorkingDay, toEpochDay, toIsoDate, weekdayOf } from '../domain/index.js';
import type { IsoDate, WeekdayCode, WorkCalendar } from '../domain/index.js';

const WEEKDAY_LABELS: Readonly<Record<WeekdayCode, string>> = {
  SUN: '日',
  MON: '一',
  TUE: '二',
  WED: '三',
  THU: '四',
  FRI: '五',
  SAT: '六',
};

export interface GanttDay {
  readonly key: string;
  readonly dayNumber: number;
  readonly weekdayLabel: string;
  readonly monthLabel: string;
  readonly isHoliday: boolean;
  readonly isMonthStart: boolean;
  readonly isWeekStart: boolean;
  readonly isToday: boolean;
}

/** 由 today 起算 dayCount 天的甘特時間軸。today 由呼叫端算好傳入，本函式不碰時鐘。 */
export function buildGanttTimeline(
  today: IsoDate,
  dayCount: number,
  calendar: WorkCalendar | null,
): readonly GanttDay[] {
  const startEpoch = toEpochDay(today);
  const days: GanttDay[] = [];

  for (let i = 0; i < dayCount; i += 1) {
    const date = toIsoDate(startEpoch + i);
    const weekday = weekdayOf(date);
    const [yearStr, monthStr, dayStr] = date.split('-');

    days.push({
      key: date,
      dayNumber: Number(dayStr),
      weekdayLabel: WEEKDAY_LABELS[weekday],
      monthLabel: `${yearStr} 年 ${Number(monthStr)} 月`,
      isHoliday: calendar !== null && !isWorkingDay(calendar, date),
      isMonthStart: dayStr === '01',
      isWeekStart: weekday === 'MON',
      isToday: i === 0,
    });
  }

  return days;
}

export interface GanttBarSpan {
  readonly start: number;
  readonly span: number;
}

/**
 * 工單起訖日換算成相對時間軸起點的格子座標。
 * 缺日期、起訖顛倒、或完全落在視窗外回 null；局部重疊裁進視窗顯示。
 */
export function toGanttBarSpan(
  start: IsoDate | null,
  end: IsoDate | null,
  timelineStart: IsoDate,
  dayCount: number,
): GanttBarSpan | null {
  if (start === null || end === null) return null;

  const startEpoch = toEpochDay(start);
  const endEpoch = toEpochDay(end);
  if (endEpoch < startEpoch) return null;

  const windowStartEpoch = toEpochDay(timelineStart);
  const windowEndEpoch = windowStartEpoch + dayCount - 1;

  if (endEpoch < windowStartEpoch || startEpoch > windowEndEpoch) return null;

  const clampedStart = Math.max(startEpoch, windowStartEpoch);
  const clampedEnd = Math.min(endEpoch, windowEndEpoch);

  return {
    start: clampedStart - windowStartEpoch,
    span: clampedEnd - clampedStart + 1,
  };
}
