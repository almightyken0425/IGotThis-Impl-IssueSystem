import { describe, expect, it } from 'vitest';

import { buildGanttTimeline, toGanttBarSpan } from './devOrderGantt.js';
import type { WorkCalendar } from '../domain/index.js';

function calendar(weeklyOff: WorkCalendar['weeklyOff'], exceptions: WorkCalendar['exceptions'] = []): WorkCalendar {
  return { companyId: 'c1', name: 'cal', weeklyOff, exceptions };
}

describe('buildGanttTimeline', () => {
  it('回傳 dayCount 天，key 為連續遞增的 ISO 日期字串', () => {
    const days = buildGanttTimeline('2026-08-24', 5, null);
    expect(days.map((d) => d.key)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ]);
  });

  it('第一天 isToday 為真，其餘為假', () => {
    const days = buildGanttTimeline('2026-08-24', 3, null);
    expect(days.map((d) => d.isToday)).toEqual([true, false, false]);
  });

  it('無生效日曆：全部 isHoliday 為假，即使遇到週末', () => {
    // 2026-08-24 為週一，往後 7 天含一個完整週末
    const days = buildGanttTimeline('2026-08-24', 7, null);
    expect(days.every((d) => !d.isHoliday)).toBe(true);
  });

  it('有生效日曆：weeklyOff 命中的星期 isHoliday 為真', () => {
    const days = buildGanttTimeline('2026-08-24', 7, calendar(['SAT', 'SUN']));
    // 2026-08-24(一) 25(二) 26(三) 27(四) 28(五) 29(六) 30(日)
    expect(days.map((d) => d.isHoliday)).toEqual([
      false, false, false, false, false, true, true,
    ]);
  });

  it('例外覆寫（補班日）：週規則為假日但例外 isWorking 為真 → isHoliday 為假', () => {
    const days = buildGanttTimeline(
      '2026-08-29',
      1,
      calendar(['SAT', 'SUN'], [{ date: '2026-08-29', isWorking: true }]),
    );
    expect(days[0]?.isHoliday).toBe(false);
  });

  it('例外覆寫（額外假日）：週規則為工作日但例外 isWorking 為假 → isHoliday 為真', () => {
    const days = buildGanttTimeline(
      '2026-08-24',
      1,
      calendar(['SAT', 'SUN'], [{ date: '2026-08-24', isWorking: false }]),
    );
    expect(days[0]?.isHoliday).toBe(true);
  });

  it('每月第一天 isMonthStart 為真，其餘為假', () => {
    const days = buildGanttTimeline('2026-08-31', 3, null);
    expect(days.map((d) => d.isMonthStart)).toEqual([false, true, false]);
  });

  it('每週一 isWeekStart 為真，其餘為假', () => {
    const days = buildGanttTimeline('2026-08-23', 3, null);
    // 23(日) 24(一) 25(二)
    expect(days.map((d) => d.isWeekStart)).toEqual([false, true, false]);
  });

  it('跨月時 monthLabel 隨月份改變', () => {
    const days = buildGanttTimeline('2026-08-31', 2, null);
    expect(days[0]?.monthLabel).toBe('2026 年 8 月');
    expect(days[1]?.monthLabel).toBe('2026 年 9 月');
  });

  it('dayCount 為 0：回空陣列', () => {
    expect(buildGanttTimeline('2026-08-24', 0, null)).toEqual([]);
  });
});

describe('toGanttBarSpan', () => {
  const WINDOW_START = '2026-08-24';
  const DAY_COUNT = 56; // 8 週

  it('起訖皆在視窗內：回正確 start/span', () => {
    expect(toGanttBarSpan('2026-08-25', '2026-08-27', WINDOW_START, DAY_COUNT)).toEqual({
      start: 1,
      span: 3,
    });
  });

  it('單日工單（start === end）：span 為 1', () => {
    expect(toGanttBarSpan('2026-08-25', '2026-08-25', WINDOW_START, DAY_COUNT)).toEqual({
      start: 1,
      span: 1,
    });
  });

  it('start 為 null：回 null', () => {
    expect(toGanttBarSpan(null, '2026-08-25', WINDOW_START, DAY_COUNT)).toBeNull();
  });

  it('end 為 null：回 null', () => {
    expect(toGanttBarSpan('2026-08-25', null, WINDOW_START, DAY_COUNT)).toBeNull();
  });

  it('起訖皆 null：回 null', () => {
    expect(toGanttBarSpan(null, null, WINDOW_START, DAY_COUNT)).toBeNull();
  });

  it('end 早於 start（資料異常）：回 null', () => {
    expect(toGanttBarSpan('2026-08-27', '2026-08-25', WINDOW_START, DAY_COUNT)).toBeNull();
  });

  it('start 早於視窗起點、end 在窗內：裁至 start=0', () => {
    expect(toGanttBarSpan('2026-08-20', '2026-08-26', WINDOW_START, DAY_COUNT)).toEqual({
      start: 0,
      span: 3, // 08-24, 25, 26 三天
    });
  });

  it('end 晚於視窗末端、start 在窗內：裁至視窗最後一天', () => {
    // 視窗 08-24 起 56 天，末端為 10-18
    expect(toGanttBarSpan('2026-10-17', '2026-11-01', WINDOW_START, DAY_COUNT)).toEqual({
      start: 54,
      span: 2, // 10-17, 10-18
    });
  });

  it('起訖皆早於視窗起點（完全在窗外，左側）：回 null', () => {
    expect(toGanttBarSpan('2026-08-10', '2026-08-15', WINDOW_START, DAY_COUNT)).toBeNull();
  });

  it('起訖皆晚於視窗末端（完全在窗外，右側）：回 null', () => {
    expect(toGanttBarSpan('2026-12-01', '2026-12-10', WINDOW_START, DAY_COUNT)).toBeNull();
  });

  it('起訖橫跨整個視窗（比視窗還長）：start=0，span=dayCount', () => {
    expect(toGanttBarSpan('2026-01-01', '2026-12-31', WINDOW_START, DAY_COUNT)).toEqual({
      start: 0,
      span: DAY_COUNT,
    });
  });

  it('start 恰為視窗最後一天：不誤判窗外，span 仍為正值', () => {
    // 視窗末端為 10-18
    expect(toGanttBarSpan('2026-10-18', '2026-10-25', WINDOW_START, DAY_COUNT)).toEqual({
      start: 55,
      span: 1,
    });
  });
});
