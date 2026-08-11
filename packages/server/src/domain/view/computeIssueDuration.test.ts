import { describe, expect, it } from 'vitest';

import type { WorkCalendar } from '../shared/index.js';

import { computeIssueDuration } from './computeIssueDuration.js';

const CALENDAR: WorkCalendar = {
  companyId: 'company-1',
  name: '台灣',
  weeklyOff: ['SAT', 'SUN'],
  exceptions: [],
};

describe('computeIssueDuration', () => {
  it('缺開始日：無工期', () => {
    expect(computeIssueDuration(null, '2026-01-10', null)).toEqual({ hasDuration: false });
  });

  it('缺結束日：無工期', () => {
    expect(computeIssueDuration('2026-01-05', null, null)).toEqual({ hasDuration: false });
  });

  it('起訖皆缺：無工期', () => {
    expect(computeIssueDuration(null, null, null)).toEqual({ hasDuration: false });
  });

  it('無生效日曆：天數退回日曆天', () => {
    // 週一到週五整整一週，日曆天為 7。
    const result = computeIssueDuration('2026-01-05', '2026-01-12', null);

    expect(result).toEqual({ hasDuration: true, days: 7, unit: 'calendarDay' });
  });

  it('有生效日曆：天數扣除假日，單位為工作天', () => {
    // 2026-01-05 為週一，2026-01-12 為週一：中間跨一個六日。
    const result = computeIssueDuration('2026-01-05', '2026-01-12', CALENDAR);

    expect(result).toEqual({ hasDuration: true, days: 5, unit: 'workingDay' });
  });
});
