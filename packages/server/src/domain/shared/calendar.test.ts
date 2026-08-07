import { describe, expect, it } from 'vitest';

import { differenceInWorkingDays, isWorkingDay } from './calendar.js';
import type { WorkCalendar } from './calendar.js';
import { differenceInCalendarDays } from './date.js';

const COMPANY_ID = 'company-1';

/** 週休二日、無例外的基本日曆。 */
function weekendCalendar(exceptions: WorkCalendar['exceptions'] = []): WorkCalendar {
  return {
    companyId: COMPANY_ID,
    name: '台灣',
    weeklyOff: ['SAT', 'SUN'],
    exceptions,
  };
}

describe('isWorkingDay 判定單日', () => {
  it('週規則內的星期為假日', () => {
    // 2026-03-07 為星期六、2026-03-08 為星期日。
    expect(isWorkingDay(weekendCalendar(), '2026-03-07')).toBe(false);
    expect(isWorkingDay(weekendCalendar(), '2026-03-08')).toBe(false);
  });

  it('週規則外的星期為工作日', () => {
    // 2026-03-09 為星期一。
    expect(isWorkingDay(weekendCalendar(), '2026-03-09')).toBe(true);
  });

  it('例外 isWorking 為假時，工作日改為假日', () => {
    const calendar = weekendCalendar([{ date: '2026-03-09', isWorking: false }]);

    expect(isWorkingDay(calendar, '2026-03-09')).toBe(false);
  });

  it('例外 isWorking 為真時，週休日改為補班工作日', () => {
    const calendar = weekendCalendar([{ date: '2026-03-07', isWorking: true }]);

    expect(isWorkingDay(calendar, '2026-03-07')).toBe(true);
  });

  it('週規則為空清單時每天都是工作日', () => {
    const calendar: WorkCalendar = {
      companyId: COMPANY_ID,
      name: '全年無休',
      weeklyOff: [],
      exceptions: [],
    };

    expect(isWorkingDay(calendar, '2026-03-07')).toBe(true);
  });

  it('日期格式不合時擲出 INVALID_DATE', () => {
    expect(() => isWorkingDay(weekendCalendar(), '2026/03/07')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DATE' }),
    );
    expect(() => isWorkingDay(weekendCalendar(), '2026-13-01')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DATE' }),
    );
  });
});

describe('differenceInWorkingDays 工作天差距', () => {
  it('同一天差距為零', () => {
    expect(differenceInWorkingDays(weekendCalendar(), '2026-03-09', '2026-03-09')).toBe(0);
  });

  it('相鄰兩個工作日差距為一天', () => {
    // 2026-03-02 星期一到 2026-03-03 星期二。
    expect(differenceInWorkingDays(weekendCalendar(), '2026-03-02', '2026-03-03')).toBe(1);
  });

  it('跨週末時扣掉週休兩天', () => {
    // 2026-03-06 星期五到 2026-03-09 星期一：日曆天三天、工作天一天。
    expect(differenceInWorkingDays(weekendCalendar(), '2026-03-06', '2026-03-09')).toBe(1);
  });

  it('整週跨越時只計五個工作天', () => {
    // 2026-03-06 星期五到 2026-03-13 星期五：日曆天七天。
    expect(differenceInWorkingDays(weekendCalendar(), '2026-03-06', '2026-03-13')).toBe(5);
  });

  it('區間內的國定假日一併扣除', () => {
    const calendar = weekendCalendar([{ date: '2026-03-11', isWorking: false }]);

    expect(differenceInWorkingDays(calendar, '2026-03-06', '2026-03-13')).toBe(4);
  });

  it('區間內的補班日一併加回', () => {
    const calendar = weekendCalendar([{ date: '2026-03-07', isWorking: true }]);

    expect(differenceInWorkingDays(calendar, '2026-03-06', '2026-03-09')).toBe(2);
  });

  it('起日本身不計入，例外落在起日不影響差距', () => {
    const calendar = weekendCalendar([{ date: '2026-03-02', isWorking: false }]);

    expect(differenceInWorkingDays(calendar, '2026-03-02', '2026-03-03')).toBe(1);
  });

  it('區間外的例外不影響差距', () => {
    const calendar = weekendCalendar([{ date: '2026-04-01', isWorking: false }]);

    expect(differenceInWorkingDays(calendar, '2026-03-02', '2026-03-03')).toBe(1);
  });

  it('迄日早於起日時回傳負值', () => {
    expect(differenceInWorkingDays(weekendCalendar(), '2026-03-09', '2026-03-06')).toBe(-1);
  });

  it('跨月與跨年皆逐日判定', () => {
    // 2026-03-31 星期二到 2026-04-01 星期三。
    expect(differenceInWorkingDays(weekendCalendar(), '2026-03-31', '2026-04-01')).toBe(1);
    // 2025-12-31 星期三到 2026-01-05 星期一：中間夾一個週末。
    expect(differenceInWorkingDays(weekendCalendar(), '2025-12-31', '2026-01-05')).toBe(3);
  });
});

describe('differenceInCalendarDays 日曆天差距', () => {
  it('未設定日曆時的退路，週末與假日照計', () => {
    expect(differenceInCalendarDays('2026-03-06', '2026-03-09')).toBe(3);
  });

  it('同一天差距為零', () => {
    expect(differenceInCalendarDays('2026-03-06', '2026-03-06')).toBe(0);
  });

  it('迄日早於起日時回傳負值', () => {
    expect(differenceInCalendarDays('2026-03-09', '2026-03-06')).toBe(-3);
  });

  it('跨年逐日計算', () => {
    expect(differenceInCalendarDays('2025-12-31', '2026-01-05')).toBe(5);
  });

  it('日期格式不合時擲出 INVALID_DATE', () => {
    expect(() => differenceInCalendarDays('2026-03-06', '')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DATE' }),
    );
  });
});
