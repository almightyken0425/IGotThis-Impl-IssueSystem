// DevOrderScreen · 顯示格式化與層級軸詞彙
//
// 甘特天資料與主題單清單改吃 /api/views/:id/issues（見 api/views.ts 的
// getDevOrderIssues），本檔不再持有任何假資料或本地日曆建構。留下的是兩類
// 純粹依附畫面的邏輯：
//   - 工期／時間軸範圍的顯示格式化（workdaysBetween／durationLabel／rangeLabel）
//   - 層級軸詞彙（DevOrderLevelId 三態、深度、與後端數字層級的對照）
// 兩者都不屬於 no7_view_logic.md 定義的 Logic 函式，是這個畫面的視覺投影，
// 跟 devOrderGantt.ts 是同一類分工。
//
// design 端的 DEV_ORDER_VARIANTS 不搬：五個 variant 是 canvas 並排比較用的
// 快照；app 只有一組資料，層級、排序、拖曳都由真實狀態產生。

import type { GanttDay } from '../../components/gantt';

/**
 * 工期 = 起訖區間內的非假日天數。畫面端不自訂演算法，
 * 只是把 computeIssueDuration 的「依日曆扣假日」結果套用在甘特天資料上。
 */
export function workdaysBetween(days: readonly GanttDay[], start: number, span: number): number {
  let count = 0;
  for (let i = start; i < start + span && i < days.length; i += 1) {
    if (days[i]?.isHoliday !== true) count += 1;
  }
  return count;
}

/** 工期數字。單位與所用日曆由板底圖例統一標明，長條內只放數字與單位。 */
export function durationLabel(days: readonly GanttDay[], bar: DevOrderBar): string {
  return `${workdaysBetween(days, bar.start, bar.span)} 天`;
}

/** 時間軸區間說明。桌面基準寬放不下整段，工具列以此告知整段跨度。 */
export function rangeLabel(days: readonly GanttDay[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return '';
  const monthOf = (day: GanttDay) =>
    day.monthLabel.replace(/^\d+\s*年\s*/, '').replace(/\s*月$/, '');
  return `${monthOf(first)}/${first.dayNumber} – ${monthOf(last)}/${last.dayNumber} · ${days.length} 天`;
}

// ─── 層級軸 ──────────────────────────────────────────────────

export type DevOrderLevelId = 'epic' | 'story' | 'task';

export const DEV_ORDER_LEVELS: readonly { readonly id: DevOrderLevelId; readonly label: string }[] =
  [
    { id: 'epic', label: '主題' },
    { id: 'story', label: '需求' },
    { id: 'task', label: '工項' },
  ];

export const DEV_ORDER_DEFAULT_LEVEL: DevOrderLevelId = 'epic';

/** GanttBar 的 level 縮排階：主題 0、需求 1、工項 2。 */
export const DEV_ORDER_LEVEL_DEPTH: { readonly [K in DevOrderLevelId]: number } = {
  epic: 0,
  story: 1,
  task: 2,
};

/**
 * 後端顯示層級數字 → 前端層級軸 id 的對照。對齊 views.ts 路由註解
 * 「顯示層級數字：epic↔1, story↔2, task↔3」，後端刻意不知道 epic/story/task
 * 這組詞彙，換算留在前端做。
 */
export const DEV_ORDER_LEVEL_BY_NUMBER: Readonly<Record<number, DevOrderLevelId>> = {
  1: 'epic',
  2: 'story',
  3: 'task',
};

// ─── 主題單 ──────────────────────────────────────────────────
// levels 的鍵對應 LevelSwitcher 的 id；值的三態：
//   null  該層級無內容      → 空列（虛線 + 尚未拆到該層深度）
//   []    有內容但未排程    → 不畫長條（缺 StartTime 或 EndTime）
//   [...] 有內容且已排程    → 依 start / span 畫長條

export interface DevOrderBar {
  readonly start: number;
  readonly span: number;
}

export type DevOrderLevelBars = readonly DevOrderBar[] | null;

export interface DevOrderIssue {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly levels: { readonly [K in DevOrderLevelId]: DevOrderLevelBars };
}
