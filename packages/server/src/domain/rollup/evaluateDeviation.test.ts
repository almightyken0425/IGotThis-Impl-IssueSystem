import { describe, expect, it } from 'vitest';

import type { WorkCalendar } from '../shared/index.js';
import { evaluateDeviation } from './evaluateDeviation.js';
import { COMPANY_ID, fieldValue, makeSnapshot, relation, workLog } from './fixtures.js';

function weekendCalendar(exceptions: WorkCalendar['exceptions'] = []): WorkCalendar {
  return {
    companyId: COMPANY_ID,
    name: '台灣',
    weeklyOff: ['SAT', 'SUN'],
    exceptions,
  };
}

describe('evaluateDeviation 偏離判定', () => {
  it('手動值小於彙總值時標示偏離，附差距值與單位', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child-a'), relation('parent', 'child-b')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 5, 'manual'),
        fieldValue('child-a', 'StoryPoint', 5),
        fieldValue('child-b', 'StoryPoint', 3),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'StoryPoint', null)).toEqual({
      deviated: true,
      mainValue: 5,
      rollupValue: 8,
      delta: 3,
      unit: 'point',
      calendarName: null,
    });
  });

  it('手動值大於彙總值時差距為負', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 8, 'manual'),
        fieldValue('child', 'StoryPoint', 3),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'StoryPoint', null)).toMatchObject({
      deviated: true,
      delta: -5,
    });
  });

  it('手動值與彙總值相等時不標示', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 3, 'manual'),
        fieldValue('child', 'StoryPoint', 3),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'StoryPoint', null)).toEqual({ deviated: false });
  });

  it('不設差距門檻，極小差距照樣標示', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 3, 'manual'),
        fieldValue('child', 'StoryPoint', 3.5),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'StoryPoint', null)).toMatchObject({
      deviated: true,
      delta: 0.5,
    });
  });
});

describe('evaluateDeviation 天數單位', () => {
  it('日期欄位以工作天計，扣除週休', () => {
    // 主值 2026-03-06 星期五、彙總值 2026-03-09 星期一：日曆天三天、工作天一天。
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'EndTime', '2026-03-06', 'manual'),
        fieldValue('child', 'EndTime', '2026-03-09'),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'EndTime', weekendCalendar())).toEqual({
      deviated: true,
      mainValue: '2026-03-06',
      rollupValue: '2026-03-09',
      delta: 1,
      unit: 'workingDay',
      calendarName: '台灣',
    });
  });

  it('採用日曆的國定假日一併扣除', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'EndTime', '2026-03-06', 'manual'),
        fieldValue('child', 'EndTime', '2026-03-13'),
      ],
    });
    const calendar = weekendCalendar([{ date: '2026-03-11', isWorking: false }]);

    expect(evaluateDeviation(snap, 'parent', 'EndTime', calendar)).toMatchObject({
      delta: 4,
      unit: 'workingDay',
      calendarName: '台灣',
    });
  });

  it('未設定日曆時退回日曆天', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'EndTime', '2026-03-06', 'manual'),
        fieldValue('child', 'EndTime', '2026-03-09'),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'EndTime', null)).toMatchObject({
      delta: 3,
      unit: 'calendarDay',
      calendarName: null,
    });
  });

  it('彙總值早於主值時差距為負', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StartTime', '2026-03-09', 'manual'),
        fieldValue('child', 'StartTime', '2026-03-06'),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'StartTime', weekendCalendar())).toMatchObject({
      delta: -1,
      unit: 'workingDay',
    });
  });

  it('兩值都落在假日時仍標示偏離，工作天差距為零', () => {
    // 2026-03-07 星期六與 2026-03-08 星期日之間沒有工作天，但兩值確實不同。
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'EndTime', '2026-03-07', 'manual'),
        fieldValue('child', 'EndTime', '2026-03-08'),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'EndTime', weekendCalendar())).toMatchObject({
      deviated: true,
      delta: 0,
      unit: 'workingDay',
    });
  });
});

describe('evaluateDeviation 邊界與錯誤路徑', () => {
  it('葉節點無彙總值可比，不標示', () => {
    const snap = makeSnapshot({
      fieldValues: [fieldValue('leaf', 'StoryPoint', 5, 'manual')],
    });

    expect(evaluateDeviation(snap, 'leaf', 'StoryPoint', null)).toEqual({ deviated: false });
  });

  it('葉節點連主值都沒有時同樣不標示', () => {
    const snap = makeSnapshot();

    expect(evaluateDeviation(snap, 'leaf', 'EndTime', null)).toEqual({ deviated: false });
  });

  it('下級皆無該欄位值時不標示', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 5, 'manual'),
        fieldValue('child', 'StartTime', '2026-01-01'),
      ],
    });

    expect(evaluateDeviation(snap, 'parent', 'StoryPoint', null)).toEqual({ deviated: false });
  });

  it('生效模式為 auto 時擲出 NOT_MANUAL_MODE', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 5, 'auto'),
        fieldValue('child', 'StoryPoint', 3),
      ],
    });

    expect(() => evaluateDeviation(snap, 'parent', 'StoryPoint', null)).toThrowError(
      expect.objectContaining({ code: 'NOT_MANUAL_MODE' }),
    );
  });

  it('WorkLog 恆為 auto，擲出 NOT_MANUAL_MODE', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [fieldValue('parent', 'WorkLog', 2, 'manual')],
      fieldRecords: [workLog('child', 4)],
    });

    expect(() => evaluateDeviation(snap, 'parent', 'WorkLog', null)).toThrowError(
      expect.objectContaining({ code: 'NOT_MANUAL_MODE' }),
    );
  });

  it('不可彙總的欄位擲出 FIELD_NOT_ROLLUPABLE', () => {
    const snap = makeSnapshot({ relations: [relation('parent', 'child')] });

    expect(() => evaluateDeviation(snap, 'parent', 'Title', null)).toThrowError(
      expect.objectContaining({ code: 'FIELD_NOT_ROLLUPABLE' }),
    );
  });
});
