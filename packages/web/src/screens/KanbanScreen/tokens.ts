// KANBAN_SCREEN_TOKENS · 看板畫面的 composition 參數
//
// 來源：design git 的 `30_screens/no2_kanban_screen/no2_kanban_screen.jsx` 檔內
// 同名常數。仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊。
//
// 只承載「本畫面怎麼組」的值；元件內部尺寸留在 DATA_DISPLAY_TOKENS。
// 值一律引用既有階梯，離開階梯的標 `// (literal: 原因)`。
//
// 未搬入的三組，皆因 app 的容器與互動機制與 canvas 不同：
//   CANVAS_WIDTH / CANVAS_MIN_HEIGHT  canvas 需要固定尺寸 artboard，
//                                     app 內畫面吃 AppShell 的剩餘空間
//   DRAG_OVERLAY_*                    canvas 的 dragging variant 靠自製浮層演出
//                                     抬起的卡片；app 走瀏覽器原生拖放，
//                                     拖曳影像由瀏覽器產生，自製浮層會變成第二張卡

import {
  BORDER_WIDTH,
  CONTROL_HEIGHT,
  DATA_DISPLAY_TOKENS,
  ICON_SIZE,
  MOTION,
  RADIUS,
  SPACING,
  TYPE_STYLES,
} from '../../theme';

export const KANBAN_SCREEN_TOKENS = {
  PADDING_X: SPACING.xl, // 24
  PADDING_BOTTOM: SPACING.lg, // 16
  FILTER_BAR_PADDING_Y: SPACING.sm,
  FILTER_BAR_GAP: SPACING.sm,
  NOTICE_MARGIN_BOTTOM: SPACING.sm,

  VIEW_TITLE_TYPE: TYPE_STYLES.bodyMedium, // 檢視名稱
  META_TYPE: TYPE_STYLES.caption, // 合欄說明等附註
  SEARCH_WIDTH: SPACING.xl * 14, // 336，搜尋框在工具列中段的定寬

  BOARD_GAP: DATA_DISPLAY_TOKENS.KANBAN.COLUMN_GAP,
  COLUMN_BODY_MAX_HEIGHT: SPACING['4xl'] * 10, // 480，欄內捲動，板面高度不被最長欄撐爆

  // 放置指示槽：高度取一張兩行標題卡的視覺高，落點才不會在放開時位移。
  DROP_SLOT_HEIGHT: SPACING['4xl'] + SPACING.xl, // 72
  DROP_SLOT_RADIUS: DATA_DISPLAY_TOKENS.KANBAN.CARD_RADIUS,
  DROP_SLOT_BORDER_WIDTH: BORDER_WIDTH.focus,
  DROP_SLOT_TYPE: TYPE_STYLES.caption,

  // 結案原因浮層：比欄寬左右各外擴一階，讀作蓋在欄上的面板而非欄內內容。
  PROMPT_TOP: DATA_DISPLAY_TOKENS.KANBAN.COLUMN_HEADER_HEIGHT + SPACING.md,
  PROMPT_SIDE_OVERHANG: SPACING.md,
  PROMPT_PADDING: SPACING.md,
  PROMPT_GAP: SPACING.sm,
  PROMPT_RADIUS: RADIUS.lg,
  PROMPT_BORDER_WIDTH: BORDER_WIDTH.hairline,
  PROMPT_TITLE_TYPE: TYPE_STYLES.bodyMedium,
  PROMPT_SUBTITLE_TYPE: TYPE_STYLES.caption,
  PROMPT_HINT_TYPE: TYPE_STYLES.caption,
  PROMPT_OPTION_HEIGHT: CONTROL_HEIGHT.lg, // 32
  PROMPT_OPTION_PADDING_X: SPACING.sm,
  PROMPT_OPTION_GAP: SPACING.sm,
  PROMPT_OPTION_RADIUS: RADIUS.sm,
  PROMPT_OPTION_TYPE: TYPE_STYLES.bodySm,
  PROMPT_RADIO_SIZE: ICON_SIZE.md, // 16
  PROMPT_RADIO_DOT_SIZE: SPACING.sm, // 8
  PROMPT_RADIO_BORDER: BORDER_WIDTH.hairline,
  PROMPT_DIVIDER_WIDTH: BORDER_WIDTH.hairline,
  PROMPT_FOOTER_GAP: SPACING.sm,
  PROMPT_FOOTER_MARGIN_TOP: SPACING.xs,

  SCRIM_OPACITY: 0.32, // (literal: 浮層開啟時板面的壓暗程度)
  Z_SCRIM: 1, // (literal: 疊層序，以下兩鍵成組)
  Z_ANCHOR_COLUMN: 2, // (literal: 承載浮層的欄要蓋過 scrim)

  TRANSITION_MS: MOTION.duration.fast,
  TRANSITION_EASING: MOTION.easing.standard,
} as const;
