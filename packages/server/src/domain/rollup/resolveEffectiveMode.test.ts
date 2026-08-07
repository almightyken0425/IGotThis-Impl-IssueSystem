import { describe, expect, it } from 'vitest';

import { BEFORE_TYPE_ID, fieldValue, makeSnapshot, relation } from './fixtures.js';
import { resolveEffectiveMode } from './resolveEffectiveMode.js';

describe('resolveEffectiveMode 判定生效模式', () => {
  it('葉節點恆為 manual，即使 rollupMode 記 auto', () => {
    const snap = makeSnapshot({
      fieldValues: [fieldValue('leaf', 'StoryPoint', 3, 'auto')],
    });

    expect(resolveEffectiveMode(snap, 'leaf', 'StoryPoint')).toBe('manual');
  });

  it('只有彙總開關為假的下級仍算葉節點', () => {
    const snap = makeSnapshot({
      relations: [relation('issue', 'successor', BEFORE_TYPE_ID)],
      fieldValues: [fieldValue('issue', 'StoryPoint', 3, 'auto')],
    });

    expect(resolveEffectiveMode(snap, 'issue', 'StoryPoint')).toBe('manual');
  });

  it('葉節點的 WorkLog 同樣為 manual，葉節點規則先於工時規則', () => {
    const snap = makeSnapshot();

    expect(resolveEffectiveMode(snap, 'leaf', 'WorkLog')).toBe('manual');
  });

  it('有下級的 WorkLog 恆為 auto，即使 rollupMode 記 manual', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [fieldValue('parent', 'WorkLog', 8, 'manual')],
    });

    expect(resolveEffectiveMode(snap, 'parent', 'WorkLog')).toBe('auto');
  });

  it('有下級的其餘欄位讀 rollupMode 當下的值', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StartTime', '2026-01-01', 'manual'),
        fieldValue('parent', 'EndTime', '2026-02-01', 'auto'),
      ],
    });

    expect(resolveEffectiveMode(snap, 'parent', 'StartTime')).toBe('manual');
    expect(resolveEffectiveMode(snap, 'parent', 'EndTime')).toBe('auto');
  });

  it('rollupMode 尚無值時退回模式初值規則：有值為 manual', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [fieldValue('parent', 'StoryPoint', 8, null)],
    });

    expect(resolveEffectiveMode(snap, 'parent', 'StoryPoint')).toBe('manual');
  });

  it('欄位連值都沒有時退回模式初值規則：空為 auto', () => {
    const snap = makeSnapshot({ relations: [relation('parent', 'child')] });

    expect(resolveEffectiveMode(snap, 'parent', 'StoryPoint')).toBe('auto');
  });

  it('不可彙總的欄位擲出 FIELD_NOT_ROLLUPABLE', () => {
    const snap = makeSnapshot({ relations: [relation('parent', 'child')] });

    expect(() => resolveEffectiveMode(snap, 'parent', 'Title')).toThrowError(
      expect.objectContaining({ code: 'FIELD_NOT_ROLLUPABLE' }),
    );
  });
});
