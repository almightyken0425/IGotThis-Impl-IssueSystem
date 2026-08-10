import { DomainError } from '../shared/index.js';

import type { SortEntryRef } from './types.js';

// 手動排序位置的值計算。
//
// 對應 spec: ViewLogic / assignSortPosition 的排序值決定部分；
// 落庫（新增或更新 ViewSortEntries）由呼叫端負責，本層不碰 IO。
//
// 取值策略為相鄰兩者取中點：重排只寫目標工單一列，不必重寫整個清單。
// 代價是反覆往同一縫隙插入會耗盡 double 精度，屆時擲錯要求呼叫端重鋪。

/** 已排序區為空時的起始值；往前往後都還有大量可用空間。 */
const BASE_VALUE = 1024;

/** 插到頭尾時與現有極值的間距。 */
const EDGE_STEP = 1024;

export type SortPositionCode = 'SORT_INDEX_OUT_OF_RANGE' | 'SORT_PRECISION_EXHAUSTED';

/** 排序位置無法決定時擲出；`code` 區分越界與精度耗盡。 */
export class SortPositionError extends DomainError<SortPositionCode> {}

/**
 * 算出目標工單放到指定位置後應有的排序值。
 * 對應 spec: ViewLogic / assignSortPosition。
 *
 * `targetIndex` 是「把目標自己移出後」的清單插入位置，0 為最前、長度值為最後。
 * 移入已排序區與既有項目重排走同一條路徑：先移出自己，再取新位置的前後鄰中點。
 *
 * @throws {SortPositionError} 位置越界，或前後鄰之間已無可用的中間值
 */
export function assignSortPosition(
  sorted: readonly SortEntryRef[],
  issueId: string,
  targetIndex: number,
): number {
  const others = ascending(sorted).filter((entry) => entry.issueId !== issueId);

  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > others.length) {
    throw new SortPositionError(
      'SORT_INDEX_OUT_OF_RANGE',
      `排序位置 ${targetIndex} 超出可插入範圍 0..${others.length}`,
    );
  }

  const before = others[targetIndex - 1];
  const after = others[targetIndex];

  if (before === undefined && after === undefined) return BASE_VALUE;
  if (before === undefined) return (after as SortEntryRef).sortValue - EDGE_STEP;
  if (after === undefined) return before.sortValue + EDGE_STEP;

  return midpoint(before.sortValue, after.sortValue);
}

/** 依 sortValue 升冪，不動輸入陣列。 */
function ascending(entries: readonly SortEntryRef[]): SortEntryRef[] {
  return [...entries].sort((left, right) => left.sortValue - right.sortValue);
}

/**
 * 兩值的中點。
 * 撞到任一端代表 double 已無中間值可表示，此時擲錯而非回傳撞值——
 * 靜默回傳會讓兩列 sortValue 相等，先後從此由資料庫回傳順序決定。
 */
function midpoint(before: number, after: number): number {
  const value = before + (after - before) / 2;

  if (value <= before || value >= after) {
    throw new SortPositionError(
      'SORT_PRECISION_EXHAUSTED',
      `排序值 ${before} 與 ${after} 之間已無中間值，該檢視的排序值需重鋪`,
    );
  }

  return value;
}
