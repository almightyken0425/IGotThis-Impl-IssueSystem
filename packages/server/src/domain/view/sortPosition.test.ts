import { describe, expect, it } from 'vitest';

import { assignSortPosition, SortPositionError } from './sortPosition.js';
import type { SortEntryRef } from './types.js';

describe('assignSortPosition', () => {
  it('空的已排序區：任何插入都落在基準值', () => {
    expect(assignSortPosition([], 'a', 0)).toBe(1024);
  });

  it('插到最前：值小於現有最小', () => {
    const sorted = entries([['a', 100]]);
    const value = assignSortPosition(sorted, 'b', 0);

    expect(value).toBeLessThan(100);
  });

  it('插到最後：值大於現有最大', () => {
    const sorted = entries([
      ['a', 100],
      ['b', 200],
    ]);
    const value = assignSortPosition(sorted, 'c', 2);

    expect(value).toBeGreaterThan(200);
  });

  it('插到中間：值落在前後兩者之間', () => {
    const sorted = entries([
      ['a', 100],
      ['b', 200],
    ]);
    const value = assignSortPosition(sorted, 'c', 1);

    expect(value).toBeGreaterThan(100);
    expect(value).toBeLessThan(200);
  });

  it('輸入順序不影響結果，內部依 sortValue 排序', () => {
    const shuffled = entries([
      ['b', 200],
      ['a', 100],
      ['c', 300],
    ]);
    const value = assignSortPosition(shuffled, 'x', 1);

    expect(value).toBeGreaterThan(100);
    expect(value).toBeLessThan(200);
  });

  // spec ViewLogic / assignSortPosition：既有項目重排依放置位置更新排序值。
  it('重排既有項目：先把自己移出再算位置', () => {
    const sorted = entries([
      ['a', 100],
      ['b', 200],
      ['c', 300],
    ]);
    // 移除 a 後剩 [b, c]，index 1 代表落在 b 與 c 之間。
    const value = assignSortPosition(sorted, 'a', 1);

    expect(value).toBeGreaterThan(200);
    expect(value).toBeLessThan(300);
  });

  it('重排到尾端：自己被移出後 index 等於剩餘長度', () => {
    const sorted = entries([
      ['a', 100],
      ['b', 200],
      ['c', 300],
    ]);
    const value = assignSortPosition(sorted, 'a', 2);

    expect(value).toBeGreaterThan(300);
  });

  it('重排回原位：值仍落在原本的前後鄰之間', () => {
    const sorted = entries([
      ['a', 100],
      ['b', 200],
      ['c', 300],
    ]);
    const value = assignSortPosition(sorted, 'b', 1);

    expect(value).toBeGreaterThan(100);
    expect(value).toBeLessThan(300);
  });

  it('唯一一筆重排回原位：退回基準值', () => {
    expect(assignSortPosition(entries([['a', 555]]), 'a', 0)).toBe(1024);
  });

  it('不改動輸入陣列', () => {
    const sorted = entries([
      ['b', 200],
      ['a', 100],
    ]);
    const snapshot = sorted.map((entry) => entry.issueId);

    assignSortPosition(sorted, 'c', 1);

    expect(sorted.map((entry) => entry.issueId)).toEqual(snapshot);
  });

  describe('前置條件', () => {
    it('index 為負數擲 SortPositionError', () => {
      expect(() => assignSortPosition(entries([['a', 100]]), 'b', -1)).toThrow(SortPositionError);
    });

    it('index 超出可插入範圍擲 SortPositionError', () => {
      // 已排序 1 筆、插入新項，可插位置只有 0 與 1。
      expect(() => assignSortPosition(entries([['a', 100]]), 'b', 2)).toThrow(SortPositionError);
    });

    it('重排時的可插入範圍不含自己，超出即擲錯', () => {
      const sorted = entries([
        ['a', 100],
        ['b', 200],
      ]);
      // 移除 a 後剩 1 筆，可插位置只有 0 與 1。
      expect(() => assignSortPosition(sorted, 'a', 2)).toThrow(SortPositionError);
    });

    it('擲錯帶 code，呼叫端可分流', () => {
      expect(() => assignSortPosition([], 'a', 3)).toThrow(
        expect.objectContaining({ code: 'SORT_INDEX_OUT_OF_RANGE' }),
      );
    });
  });

  describe('精度耗盡', () => {
    it('相鄰兩值已無中間值可用時擲錯，不靜默回傳撞值', () => {
      const packed = entries([
        ['a', 1],
        ['b', nextAfter(1)],
      ]);

      expect(() => assignSortPosition(packed, 'c', 1)).toThrow(
        expect.objectContaining({ code: 'SORT_PRECISION_EXHAUSTED' }),
      );
    });

    it('間隔仍夠時不擲錯', () => {
      const value = assignSortPosition(
        entries([
          ['a', 1],
          ['b', 1.5],
        ]),
        'c',
        1,
      );

      expect(value).toBeGreaterThan(1);
      expect(value).toBeLessThan(1.5);
    });
  });
});

function entries(pairs: readonly (readonly [string, number])[]): SortEntryRef[] {
  return pairs.map(([issueId, sortValue]) => ({ issueId, sortValue }));
}

/** 回傳比 value 大的最小 double，用來造出無中間值的相鄰對。 */
function nextAfter(value: number): number {
  const buffer = new ArrayBuffer(8);
  const floats = new Float64Array(buffer);
  const ints = new BigInt64Array(buffer);
  floats[0] = value;
  ints[0] = (ints[0] as bigint) + 1n;
  return floats[0] as number;
}
