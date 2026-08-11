import { describe, expect, it } from 'vitest';

import { resolveViewCalendar } from './resolveViewCalendar.js';

describe('resolveViewCalendar', () => {
  it('檢視有選用日曆：回傳檢視的日曆名稱', () => {
    const name = resolveViewCalendar(
      { calendarName: '台灣' },
      { defaultCalendarName: '美國' },
    );

    expect(name).toBe('台灣');
  });

  it('檢視未選用、帳號有預設日曆：回傳帳號的預設日曆名稱', () => {
    const name = resolveViewCalendar(
      { calendarName: null },
      { defaultCalendarName: '美國' },
    );

    expect(name).toBe('美國');
  });

  it('檢視未選用、帳號也無預設：無日曆', () => {
    const name = resolveViewCalendar({ calendarName: null }, { defaultCalendarName: null });

    expect(name).toBeNull();
  });
});
