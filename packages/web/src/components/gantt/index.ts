// 甘特與導航組 · 統一匯出口
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。design 端以
// Object.assign(window, {...}) 掛七個元件到全域，impl 改由本檔具名匯出，成員一致。
//
// 消費畫面：DevOrderScreen（開發順序表）。左欄主題單清單拖拉排序、
// 右欄甘特圖依日曆天檢視各層級工單排程，兩欄逐列對齊。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no3_dev_order_screen.md
//
// 元件與角色：
//   GanttHeader    甘特標頭。月份帶 + 日期刻度帶，左側留出與清單欄同寬的 gutter
//   GanttTimeline  時間軸背景。日格線、週線、月分隔線、假日格底、列分隔線
//   GanttBar       工單長條。層級縮排、工期數字、超期偏離；空列亦由本元件承載
//   SortableRow    可拖拉的主題單列。拖曳把手、拖曳中態、原位殘影、放置指示線
//   SectionDivider 已排序區與未排序區的分隔。區塊標題 + 計數
//   LevelSwitcher  顯示層級切換器。分段控制形式
//   Toolbar        畫面工具列容器。左中右三區
//
// 共同約定：
//   - 一切視覺值走 GANTT_TOKENS（尺寸 / 節奏）與 resolveGanttColors(theme)（色彩），
//     元件不寫死 hex 與數字、不讀 THEME_LIGHT / THEME_DARK，兩主題同一份程式碼
//   - theme 由 useTheme() 自 ThemeProvider 取得，不逐層傳 prop；
//     七個元件都必須掛在 ThemeProvider 之內，否則 useTheme 會丟錯
//   - density 三檔（compact / base / relaxed）左右欄必須同值
//   - focus 外框一律吃 colors.focusRing（= theme.border.input，兩主題保 3:1）
//   - 拖曳互動本身不在本組內：SortableRow 是受控視覺層，狀態與命中判定由畫面層供給
//
// internal.ts 為同目錄共用小工具，刻意不對外匯出。

export { GanttHeader } from './GanttHeader';
export type { GanttHeaderProps } from './GanttHeader';

export { GanttTimeline } from './GanttTimeline';
export type { GanttTimelineProps } from './GanttTimeline';

export { GanttBar } from './GanttBar';
export type { GanttBarProps } from './GanttBar';

export { SortableRow } from './SortableRow';
export type { SortableRowProps } from './SortableRow';

export { SectionDivider } from './SectionDivider';
export type { SectionDividerProps } from './SectionDivider';

export { LevelSwitcher } from './LevelSwitcher';
export type { LevelSwitcherProps } from './LevelSwitcher';

export { Toolbar } from './Toolbar';
export type { ToolbarProps } from './Toolbar';

export type { DropIndicatorPosition, GanttDay, LevelOption } from './types';

/** density 鍵由 theme 層仲裁，在此轉出一手，消費端不必為了一個型別多開 import。 */
export type { Density } from '../../theme';
