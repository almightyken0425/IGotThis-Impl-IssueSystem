// LIST_SCREEN_TOKENS · 清單表格畫面的 composition 參數
//
// 來源：design git 的 `30_screens/no1_list_screen/no1_list_screen.jsx` 檔內
// 同名常數。仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊。
//
// 只承載「本畫面怎麼組」的值；可重用的元件參數留在 theme 的 componentTokens。
// 值一律引用 atomic 階梯，本檔無 hex、無裸數字。
//
// 與 design 的差異兩處，皆因 canvas 與 app 的容器不同：
//   - BASE_WIDTH 不搬。canvas 需要固定寬 artboard，app 內畫面吃 AppShell 的剩餘寬
//   - COLUMN_PANEL_*／FILTER_PANEL_* 為 impl 新增。design 的欄位顯示設定與篩選
//     面板互動只定案到行為層級（見 AGENTS.md「設計待辦」），app 要真的能開合
//     面板，故補一組面板幾何，值同樣由既有階梯組出

import {
  BORDER_WIDTH,
  CONTROL_HEIGHT,
  ICON_SIZE,
  RADIUS,
  SPACING,
  TYPE_STYLES,
} from '../../theme';

export const LIST_SCREEN_TOKENS = {
  CONTENT_PADDING_X: SPACING.xl, // 24
  CONTENT_PADDING_Y: SPACING.lg, // 16
  SECTION_GAP: SPACING.md, // 12，工具列下三段的垂直間距
  VIEW_TITLE_TYPE: TYPE_STYLES.sectionTitle,
  VIEW_META_TYPE: TYPE_STYLES.caption,
  TOOLBAR_DIVIDER_HEIGHT: ICON_SIZE.lg, // 20，檢視名稱與資料來源之間的細分隔
  TOOLBAR_DIVIDER_WIDTH: BORDER_WIDTH.hairline,
  CHIP_BAR_GAP: SPACING.sm, // 8
  CHIP_BAR_MIN_HEIGHT: CONTROL_HEIGHT.sm, // 24，條件列空著也不塌陷
  TABLE_DENSITY: 'base',

  // 欄寬對應檢視的 columnConfig，此處給的是設計基準值；
  // 標題欄不給寬、由 DataTable 吃 COLUMN_MIN_WIDTH 的 1fr 撐滿剩餘空間。
  COLUMN_WIDTH: {
    key: SPACING.xl * 5, // 120，容得下 mono 的 IGT-1042
    status: SPACING.lg * 7, // 112，四字狀態 badge 加排序指示
    assignee: SPACING.xl * 6, // 144，avatar 24 加三字姓名
    point: SPACING['3xl'] * 2, // 80，右對齊數字欄下界
    due: SPACING.lg * 7, // 112
  },

  // ─── 欄位顯示設定面板（impl 新增）───
  COLUMN_PANEL_WIDTH: SPACING['3xl'] * 6, // 240，比原 200 加寬，容納順序/寬度兩組按鈕
  COLUMN_PANEL_PADDING: SPACING.sm,
  COLUMN_PANEL_GAP: SPACING.xs,
  COLUMN_PANEL_ROW_GAP: SPACING.xs, // 每列 checkbox 與後方按鈕群的間距
  COLUMN_PANEL_OFFSET: SPACING.xs, // 面板上緣與按鈕的距離
  COLUMN_PANEL_RADIUS: RADIUS.md,
  COLUMN_PANEL_BORDER_WIDTH: BORDER_WIDTH.hairline,
  COLUMN_PANEL_TITLE_TYPE: TYPE_STYLES.overline,
  COLUMN_PANEL_HINT_TYPE: TYPE_STYLES.caption,
  COLUMN_PANEL_Z: 4, // (literal: 疊層序，面板蓋過工具列與表格)
  COLUMN_PANEL_WIDTH_STEP: SPACING.lg, // 16px，寬度增減鈕每次調整量

  // ─── 篩選面板（impl 新增，比照 COLUMN_PANEL_* 幾何）───
  FILTER_PANEL_WIDTH: SPACING['3xl'] * 9, // 360，容一列欄位下拉＋值輸入＋移除鈕
  FILTER_PANEL_PADDING: SPACING.sm,
  FILTER_PANEL_GAP: SPACING.sm,
  FILTER_PANEL_ROW_GAP: SPACING.xs,
  FILTER_PANEL_OFFSET: SPACING.xs,
  FILTER_PANEL_RADIUS: RADIUS.md,
  FILTER_PANEL_BORDER_WIDTH: BORDER_WIDTH.hairline,
  FILTER_PANEL_TITLE_TYPE: TYPE_STYLES.overline,
  FILTER_PANEL_HINT_TYPE: TYPE_STYLES.caption,
  FILTER_PANEL_Z: 4,
} as const;
