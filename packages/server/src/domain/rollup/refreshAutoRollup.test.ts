import { describe, expect, it } from 'vitest';

import {
  CHILDREN_TYPE_ID,
  CONTAINER_TYPE_ID,
  fieldValue,
  makeSnapshot,
  relation,
  workLog,
} from './fixtures.js';
import { refreshAutoRollup } from './refreshAutoRollup.js';

describe('refreshAutoRollup 下級異動重算', () => {
  it('持有端為 auto 時，主值更新為彙總值', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 2, 'auto'),
        fieldValue('child', 'StoryPoint', 5),
      ],
    });

    expect(refreshAutoRollup(snap, 'child', 'StoryPoint')).toEqual([
      { issueId: 'parent', fieldName: 'StoryPoint', value: 5 },
    ]);
  });

  it('持有端為 manual 時主值不覆蓋，不產出更新', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 2, 'manual'),
        fieldValue('child', 'StoryPoint', 5),
      ],
    });

    expect(refreshAutoRollup(snap, 'child', 'StoryPoint')).toEqual([]);
  });

  it('主值因此變動時向上逐層重算，順序由下而上', () => {
    const snap = makeSnapshot({
      relations: [relation('grandparent', 'parent'), relation('parent', 'child')],
      fieldValues: [
        fieldValue('grandparent', 'StoryPoint', 2, 'auto'),
        fieldValue('parent', 'StoryPoint', 2, 'auto'),
        fieldValue('child', 'StoryPoint', 5),
      ],
    });

    expect(refreshAutoRollup(snap, 'child', 'StoryPoint')).toEqual([
      { issueId: 'parent', fieldName: 'StoryPoint', value: 5 },
      { issueId: 'grandparent', fieldName: 'StoryPoint', value: 5 },
    ]);
  });

  it('中間層為 manual 時往上不再傳遞', () => {
    const snap = makeSnapshot({
      relations: [relation('grandparent', 'parent'), relation('parent', 'child')],
      fieldValues: [
        fieldValue('grandparent', 'StoryPoint', 2, 'auto'),
        fieldValue('parent', 'StoryPoint', 2, 'manual'),
        fieldValue('child', 'StoryPoint', 5),
      ],
    });

    expect(refreshAutoRollup(snap, 'child', 'StoryPoint')).toEqual([]);
  });

  it('持有端主值未變動時不產出更新，也不往上重算', () => {
    const snap = makeSnapshot({
      relations: [relation('grandparent', 'parent'), relation('parent', 'child')],
      fieldValues: [
        fieldValue('grandparent', 'EndTime', '2026-04-01', 'auto'),
        fieldValue('parent', 'EndTime', '2026-04-01', 'auto'),
        fieldValue('child', 'EndTime', '2026-04-01'),
      ],
    });

    expect(refreshAutoRollup(snap, 'child', 'EndTime')).toEqual([]);
  });

  it('一張下級被多個持有端指到時，各持有端都重算', () => {
    const snap = makeSnapshot({
      relations: [
        relation('parent', 'child', CHILDREN_TYPE_ID),
        relation('topic', 'child', CONTAINER_TYPE_ID),
      ],
      fieldValues: [
        fieldValue('parent', 'StoryPoint', 1, 'auto'),
        fieldValue('topic', 'StoryPoint', 1, 'auto'),
        fieldValue('child', 'StoryPoint', 5),
      ],
    });

    expect(refreshAutoRollup(snap, 'child', 'StoryPoint')).toEqual([
      { issueId: 'parent', fieldName: 'StoryPoint', value: 5 },
      { issueId: 'topic', fieldName: 'StoryPoint', value: 5 },
    ]);
  });

  it('工時異動同樣逐層往上，持有端恆為 auto', () => {
    const snap = makeSnapshot({
      relations: [relation('grandparent', 'parent'), relation('parent', 'child')],
      fieldRecords: [workLog('child', 3)],
    });

    expect(refreshAutoRollup(snap, 'child', 'WorkLog')).toEqual([
      { issueId: 'parent', fieldName: 'WorkLog', value: 3 },
      { issueId: 'grandparent', fieldName: 'WorkLog', value: 3 },
    ]);
  });

  it('下級被清空時持有端主值一併清空', () => {
    const snap = makeSnapshot({
      relations: [relation('parent', 'child')],
      fieldValues: [fieldValue('parent', 'StartTime', '2026-01-01', 'auto')],
    });

    expect(refreshAutoRollup(snap, 'child', 'StartTime')).toEqual([
      { issueId: 'parent', fieldName: 'StartTime', value: null },
    ]);
  });
});

describe('refreshAutoRollup 邊界與錯誤路徑', () => {
  it('無持有端的工單異動時不產出更新', () => {
    const snap = makeSnapshot({
      fieldValues: [fieldValue('orphan', 'StoryPoint', 5)],
    });

    expect(refreshAutoRollup(snap, 'orphan', 'StoryPoint')).toEqual([]);
  });

  it('持有端沿彙總開關為假的關聯型別時不重算', () => {
    const snap = makeSnapshot({
      relations: [relation('predecessor', 'child', 'reltype-before')],
      fieldValues: [
        fieldValue('predecessor', 'StoryPoint', 1, 'auto'),
        fieldValue('child', 'StoryPoint', 5),
      ],
    });

    expect(refreshAutoRollup(snap, 'child', 'StoryPoint')).toEqual([]);
  });

  it('關聯成環時擲出 RELATION_CYCLE', () => {
    const snap = makeSnapshot({
      relations: [relation('a', 'b'), relation('b', 'a')],
      fieldValues: [
        fieldValue('a', 'StoryPoint', 1, 'auto'),
        fieldValue('b', 'StoryPoint', 2, 'auto'),
      ],
    });

    expect(() => refreshAutoRollup(snap, 'a', 'StoryPoint')).toThrowError(
      expect.objectContaining({ code: 'RELATION_CYCLE' }),
    );
  });

  it('不可彙總的欄位擲出 FIELD_NOT_ROLLUPABLE', () => {
    const snap = makeSnapshot({ relations: [relation('parent', 'child')] });

    expect(() => refreshAutoRollup(snap, 'child', 'Title')).toThrowError(
      expect.objectContaining({ code: 'FIELD_NOT_ROLLUPABLE' }),
    );
  });
});
