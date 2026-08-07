import { describe, expect, it } from 'vitest';

import { fieldValue, makeSnapshot, relation } from './fixtures.js';
import { initializeRollupMode } from './initializeRollupMode.js';

describe('initializeRollupMode 決定模式初值', () => {
  it('欄位已有值時初值為 manual', () => {
    const snap = makeSnapshot({ fieldValues: [fieldValue('issue', 'StoryPoint', 5)] });

    expect(initializeRollupMode(snap, 'issue', 'StoryPoint')).toBe('manual');
  });

  it('欄位無值時初值為 auto', () => {
    const snap = makeSnapshot();

    expect(initializeRollupMode(snap, 'issue', 'StoryPoint')).toBe('auto');
  });

  it('值為零仍算有值，初值為 manual', () => {
    const snap = makeSnapshot({ fieldValues: [fieldValue('issue', 'StoryPoint', 0)] });

    expect(initializeRollupMode(snap, 'issue', 'StoryPoint')).toBe('manual');
  });

  it('同一工單的其他欄位有值不影響本欄位初值', () => {
    const snap = makeSnapshot({
      fieldValues: [fieldValue('issue', 'StartTime', '2026-01-01')],
    });

    expect(initializeRollupMode(snap, 'issue', 'EndTime')).toBe('auto');
  });

  it('有無下級不影響初值，只看欄位有沒有值', () => {
    const snap = makeSnapshot({
      relations: [relation('issue', 'child')],
      fieldValues: [fieldValue('issue', 'EndTime', '2026-05-05')],
    });

    expect(initializeRollupMode(snap, 'issue', 'EndTime')).toBe('manual');
  });

  it('不可彙總的欄位擲出 FIELD_NOT_ROLLUPABLE', () => {
    const snap = makeSnapshot({ fieldValues: [fieldValue('issue', 'Title', '標題')] });

    expect(() => initializeRollupMode(snap, 'issue', 'Title')).toThrowError(
      expect.objectContaining({ code: 'FIELD_NOT_ROLLUPABLE' }),
    );
  });
});
