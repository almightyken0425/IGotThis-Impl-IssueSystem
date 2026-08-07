// DevOrderScreen · 假資料與日曆
//
// 來源：design git 的 `30_screens/no3_dev_order_screen/no2_subsections.jsx`
// 前半段（日曆示例資料與主題單示例資料）。
//
// 接 API 時只替換本檔。對應的伺服器端產出：
//   DEV_ORDER_DAYS            由檢視的 StartTime / EndTime 依日曆展開的日資料
//   DEV_ORDER_ISSUES          主題單與各層級的排程區間
//   DEV_ORDER_INITIAL_SORTED  已排序區的順序，即工單的 DevOrder 欄位
//   DEV_ORDER_LEVELS          層級軸，對應工單階層定義
//   DEV_ORDER_SOURCES         檢視的 sourceMgmtIds 選項
//
// design 端的 DEV_ORDER_VARIANTS 不搬：五個 variant 是 canvas 並排比較用的
// 快照；app 只有一組資料，層級、排序、拖曳都由真實狀態產生。

import type { GanttDay } from '../../components/gantt';
import { DEV_ORDER_SCREEN_TOKENS } from './tokens';

// ─── 日曆 ────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export const DEV_ORDER_CALENDAR_NAME = '台灣行事曆 2026';

/** 週末之外的假日。有這幾天，假日格才讀得出「由日曆決定」而不只是週末。 */
const EXTRA_HOLIDAYS: readonly string[] = ['2026-9-25', '2026-10-9', '2026-10-10'];

const TIMELINE_START = { year: 2026, month: 8, day: 24 }; // 週一起算

function buildDays(
  start: { year: number; month: number; day: number },
  count: number,
  todayIndex: number,
): readonly GanttDay[] {
  const out: GanttDay[] = [];
  const cursor = new Date(start.year, start.month - 1, start.day);
  for (let i = 0; i < count; i += 1) {
    const weekday = cursor.getDay();
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
    out.push({
      key,
      dayNumber: cursor.getDate(),
      weekdayLabel: WEEKDAY_LABELS[weekday] ?? '',
      monthLabel: `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`,
      isHoliday: weekday === 0 || weekday === 6 || EXTRA_HOLIDAYS.includes(key),
      isMonthStart: cursor.getDate() === 1,
      isWeekStart: weekday === 1,
      isToday: i === todayIndex,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export const DEV_ORDER_DAYS: readonly GanttDay[] = buildDays(
  TIMELINE_START,
  DEV_ORDER_SCREEN_TOKENS.TIMELINE_DAY_COUNT,
  DEV_ORDER_SCREEN_TOKENS.TIMELINE_TODAY_INDEX,
);

/**
 * 工期 = 起訖區間內的非假日天數。畫面端不自訂演算法，
 * 只是把 computeIssueDuration 的「依日曆扣假日」結果以示例資料重現。
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

// ─── 資料來源 ────────────────────────────────────────────────

export type DevOrderSourceId = 'wave1' | 'all' | 'mine';

export const DEV_ORDER_SOURCES: readonly { readonly value: DevOrderSourceId; readonly label: string }[] =
  [
    { value: 'wave1', label: 'Wave 1 開發池' },
    { value: 'all', label: '全部主題單' },
    { value: 'mine', label: '我負責的' },
  ];

export const DEV_ORDER_DEFAULT_SOURCE: DevOrderSourceId = 'all';

// ─── 主題單 ──────────────────────────────────────────────────
// levels 的鍵對應 LevelSwitcher 的 id；值的三態：
//   null  該層級無內容      → 空列（虛線 + 尚未拆到該層深度）
//   []    有內容但未排程    → 不畫長條（缺 StartTime 或 EndTime）
//   [...] 有內容且已排程    → 依 start / span 畫長條

export interface DevOrderBar {
  readonly start: number;
  readonly span: number;
  readonly overrun?: number;
}

export type DevOrderLevelBars = readonly DevOrderBar[] | null;

export interface DevOrderIssue {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  /** 此主題單出現在哪些資料來源下。'all' 恆含全部，故不列。 */
  readonly sources: readonly Exclude<DevOrderSourceId, 'all'>[];
  readonly levels: { readonly [K in DevOrderLevelId]: DevOrderLevelBars };
}

export const DEV_ORDER_ISSUES: readonly DevOrderIssue[] = [
  {
    id: 'IGT-1',
    key: 'IGT-1',
    title: '資料模型骨架',
    sources: ['wave1', 'mine'],
    levels: {
      epic: [{ start: 0, span: 12 }],
      story: [
        { start: 0, span: 5 },
        { start: 5, span: 7 },
      ],
      task: [
        { start: 0, span: 2 },
        { start: 2, span: 3 },
        { start: 6, span: 4 },
        { start: 10, span: 2 },
      ],
    },
  },
  {
    id: 'IGT-2',
    key: 'IGT-2',
    title: '編號與狀態流程',
    sources: ['wave1'],
    levels: {
      epic: [{ start: 8, span: 10, overrun: 3 }],
      story: [
        { start: 8, span: 4 },
        { start: 12, span: 6, overrun: 3 },
      ],
      task: null,
    },
  },
  {
    id: 'IGT-3',
    key: 'IGT-3',
    title: '清單表格畫面',
    sources: ['wave1', 'mine'],
    levels: {
      epic: [{ start: 14, span: 14 }],
      story: [
        { start: 14, span: 6 },
        { start: 20, span: 8 },
      ],
      task: [
        { start: 14, span: 3 },
        { start: 17, span: 3 },
        { start: 21, span: 4 },
        { start: 25, span: 3 },
      ],
    },
  },
  {
    id: 'IGT-4',
    key: 'IGT-4',
    title: '看板畫面',
    sources: ['wave1'],
    levels: {
      epic: [{ start: 26, span: 12 }],
      story: null,
      task: null,
    },
  },
  {
    id: 'IGT-5',
    key: 'IGT-5',
    title: '開發順序表',
    sources: ['wave1', 'mine'],
    levels: {
      epic: [{ start: 34, span: 16 }],
      story: [
        { start: 34, span: 8 },
        { start: 42, span: 8 },
      ],
      task: [
        { start: 34, span: 4 },
        { start: 38, span: 4 },
      ],
    },
  },
  {
    // 已排入順序、但起訖未定：三層都不畫長條，也不是空列。
    id: 'IGT-6',
    key: 'IGT-6',
    title: '權限與日曆設定',
    sources: [],
    levels: { epic: [], story: null, task: null },
  },
  {
    id: 'IGT-7',
    key: 'IGT-7',
    title: '通知與訂閱',
    sources: ['mine'],
    levels: { epic: [], story: null, task: null },
  },
  {
    id: 'IGT-8',
    key: 'IGT-8',
    title: '報表匯出',
    sources: [],
    levels: { epic: [], story: null, task: null },
  },
  {
    id: 'IGT-9',
    key: 'IGT-9',
    title: '外部整合 Webhook',
    sources: [],
    levels: { epic: [], story: null, task: null },
  },
];

const ISSUE_BY_ID = new Map(DEV_ORDER_ISSUES.map((issue) => [issue.id, issue]));

export function devOrderIssue(id: string): DevOrderIssue | undefined {
  return ISSUE_BY_ID.get(id);
}

/** 已排序區的初始順序，即工單的 DevOrder 欄位。 */
export const DEV_ORDER_INITIAL_SORTED: readonly string[] = [
  'IGT-1',
  'IGT-2',
  'IGT-3',
  'IGT-4',
  'IGT-5',
  'IGT-6',
];

/** 未排序區：尚未分配順序的主題單。 */
export const DEV_ORDER_INITIAL_UNSORTED: readonly string[] = ['IGT-7', 'IGT-8', 'IGT-9'];

export const DEV_ORDER_INITIAL_SELECTED = 'IGT-5';

/** 被權限濾除的主題單筆數。這些主題單不在 DEV_ORDER_ISSUES 內。 */
export const DEV_ORDER_PERMISSION_FILTERED = 3;
