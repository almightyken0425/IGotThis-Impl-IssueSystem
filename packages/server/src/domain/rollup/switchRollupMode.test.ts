import { describe, expect, it } from 'vitest';

import { fieldValue, makeSnapshot, relation, workLog } from './fixtures.js';
import { switchRollupMode } from './switchRollupMode.js';

describe('switchRollupMode 切回 auto', () => {
  it('原手動值不保留，主值改寫為彙總值且轉唯讀', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child-a'), relation('parent', 'child-b')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 99, 'manual'),
        fieldValue('child-a', 'StoryPoint', 3),
        fieldValue('child-b', 'StoryPoint', 5),
      ],
    });

    expect(switchRollupMode(snap, 'parent', 'StoryPoint', 'auto')).toEqual({
      ok: true,
      issueId: 'parent',
      fieldName: 'StoryPoint',
      rollupMode: 'auto',
      value: 8,
      readonly: true,
    });
  });

  it('下級皆無值時主值一併清空，手動值不留殘影', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [fieldValue('parent', 'EndTime', '2026-12-31', 'manual')],
    });

    expect(switchRollupMode(snap, 'parent', 'EndTime', 'auto')).toMatchObject({
      ok: true,
      value: null,
    });
  });

  it('葉節點切 auto 仍寫入 auto，但彙總值為空', () => {
    const snap = makeSnapshot({
      fieldValues: [fieldValue('leaf', 'StartTime', '2026-03-01', 'manual')],
    });

    expect(switchRollupMode(snap, 'leaf', 'StartTime', 'auto')).toMatchObject({
      ok: true,
      rollupMode: 'auto',
      value: null,
    });
  });
});

describe('switchRollupMode 切到 manual', () => {
  it('主值不動、開放人工編輯', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StartTime', '2026-01-10', 'auto'),
        fieldValue('child', 'StartTime', '2026-01-10'),
      ],
    });

    expect(switchRollupMode(snap, 'parent', 'StartTime', 'manual')).toEqual({
      ok: true,
      issueId: 'parent',
      fieldName: 'StartTime',
      rollupMode: 'manual',
      value: '2026-01-10',
      readonly: false,
    });
  });

  it('主值原本為空時切 manual 維持空值', () => {
    const snap = makeSnapshot({ relations: [relation('parent', 'child')] });

    expect(switchRollupMode(snap, 'parent', 'StoryPoint', 'manual')).toMatchObject({
      ok: true,
      value: null,
      readonly: false,
    });
  });
});

describe('switchRollupMode 錯誤路徑', () => {
  it('WorkLog 不開放切換，回傳 WORKLOG_MODE_LOCKED', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldRecords: [workLog('child', 4)],
    });

    expect(switchRollupMode(snap, 'parent', 'WorkLog', 'manual')).toMatchObject({
      ok: false,
      code: 'WORKLOG_MODE_LOCKED',
    });
  });

  it('WorkLog 切 auto 同樣不開放，工時模式不由使用者決定', () => {
    const snap = makeSnapshot({ relations: [relation('parent', 'child')] });

    expect(switchRollupMode(snap, 'parent', 'WorkLog', 'auto')).toMatchObject({
      ok: false,
      code: 'WORKLOG_MODE_LOCKED',
    });
  });

  it('不可彙總的欄位擲出 FIELD_NOT_ROLLUPABLE', () => {
    const snap = makeSnapshot({ relations: [relation('parent', 'child')] });

    expect(() => switchRollupMode(snap, 'parent', 'Title', 'manual')).toThrowError(
      expect.objectContaining({ code: 'FIELD_NOT_ROLLUPABLE' }),
    );
  });
});
