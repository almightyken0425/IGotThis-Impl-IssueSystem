// DEV_ORDER_SCREEN_TOKENS · 開發順序表畫面的 composition 參數
//
// 來源：design git 的 `30_screens/no3_dev_order_screen/tokens.jsx`。
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊。
//
// 只承載本畫面獨有的組裝值：雙欄骨架、圖例列、空狀態。可重用的元件參數留在
// theme 的 GANTT_TOKENS 與 controlTokens，本檔不重新定義、只引用。
//
// 未搬入的三組：
//   FRAME_WIDTH               canvas 需要固定寬 artboard，app 內畫面吃 AppShell 的剩餘寬
//   DRAG_OVERLAY_INSET_H / _Z canvas 的 dragging variant 用自製浮起列演出被抬起的
//                             主題單；app 走瀏覽器原生拖放，拖曳影像由瀏覽器產生，
//                             自製浮層會變成第二列

import { BORDER_WIDTH, CONTROL_HEIGHT, GANTT_TOKENS, RADIUS, SPACING } from '../../theme';

export const DEV_ORDER_SCREEN_TOKENS = {
  // ─── 畫面框 ───
  FRAME_MIN_HEIGHT: 800, // (literal: 桌面瀏覽器基準高，非階梯值)
  BODY_PADDING: SPACING.lg,
  BODY_GAP: SPACING.md,

  // ─── 雙欄板 ───
  // 兩欄對齊的唯一開關：density 一個值同時決定左欄列高與右欄列高、日格寬。
  // 左右欄任一處若各自指定 rowHeight，兩欄就會錯開，故本畫面只傳 density。
  DENSITY: GANTT_TOKENS.DEFAULT_DENSITY,
  LIST_COLUMN_WIDTH: GANTT_TOKENS.LIST_COLUMN_WIDTH,
  BOARD_RADIUS: RADIUS.lg,
  BOARD_BORDER_WIDTH: BORDER_WIDTH.hairline,

  // 排程視窗天數。八週 ≈ 兩個月，桌面基準寬放不下整段，超出部分由板內橫向捲軸承接。
  TIMELINE_DAY_COUNT: 56, // (literal: 八週的日數，非視覺值)
  TIMELINE_TODAY_INDEX: 14, // (literal: 示例資料的今日落點，非視覺值)

  // ─── 標頭左 gutter（主題單欄的欄名 + 日曆說明）───
  HEADER_LEADING_GAP: SPACING['2xs'],

  // ─── 底部圖例列 ───
  LEGEND_MIN_HEIGHT: CONTROL_HEIGHT.lg,
  LEGEND_PADDING_H: SPACING.md,
  LEGEND_GAP: SPACING.lg,
  LEGEND_ITEM_GAP: SPACING.xs,
  LEGEND_SWATCH_WIDTH: SPACING.lg,
  LEGEND_SWATCH_HEIGHT: SPACING.md,
  LEGEND_SWATCH_RADIUS: RADIUS.sm,
  LEGEND_BAR_HEIGHT: SPACING.sm,
  LEGEND_RULE_WIDTH: SPACING.xl,

  // ─── 空狀態 ───
  EMPTY_MIN_HEIGHT: SPACING['4xl'] * 6, // 288

  // ─── 工具列內的次要說明文字 ───
  TOOLBAR_META_GAP: SPACING.xs,
} as const;
