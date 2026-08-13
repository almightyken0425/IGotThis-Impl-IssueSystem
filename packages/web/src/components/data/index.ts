// 資料展示組 · 統一匯出口
//
// 來源：design git 的 `20_components/no2_data_display.jsx`。
// design 端整份 `Object.assign(window, {...})` 掛全域，impl 改由本檔一處匯出，
// 元件名與 design 逐名相同，兩層對照零翻譯成本。
//
// 十三個元件：
//   DataTable — 工單表格
//   TableCell — 儲存格基底
//   TableTextCell / TableKeyCell / TableStatusCell / TableUserCell / TableDateCell / TableNumberCell
//              — 六個型別格
//   TableHeaderCell — 欄位標題格
//   KanbanColumn / KanbanCard — 看板欄與看板卡
//   EmptyState — 無資料空狀態
//   FilterNotice — 權限過濾標示列
//
// 消費畫面：ListScreen 用表格線，KanbanScreen 用看板線；三畫面（含 DevOrderScreen）
// 共用 EmptyState 與 FilterNotice。
//
// 內部工具（internal.tsx）刻意不對外匯出，只有 EmptyState 的 icon 需要 GlyphName、
// 故單獨放行這一個型別。

export { DataTable } from './DataTable';
export type {
  DataTableBaseProps,
  DataTableProps,
  DataTableSelectionProps,
  DataTableSortProps,
  RowPointerHandler,
  RowSelectHandler,
} from './DataTable';

export {
  TableCell,
  TableDateCell,
  TableKeyCell,
  TableNumberCell,
  TableStatusCell,
  TableTextCell,
  TableUserCell,
} from './TableCell';
export type {
  TableCellProps,
  TableDateCellProps,
  TableKeyCellProps,
  TableNumberCellProps,
  TableStatusCellProps,
  TableTextCellProps,
  TableUserCellProps,
} from './TableCell';

export { TableHeaderCell } from './TableHeaderCell';
export type { TableHeaderCellProps } from './TableHeaderCell';

export { KanbanColumn } from './KanbanColumn';
export type { KanbanColumnProps } from './KanbanColumn';

export { KanbanCard } from './KanbanCard';
export type { KanbanCardProps } from './KanbanCard';

export { EmptyState } from './EmptyState';
export type { EmptyStateAction, EmptyStateProps } from './EmptyState';

export { FilterNotice } from './FilterNotice';
export type { FilterNoticeProps, FilterNoticeTone } from './FilterNotice';

export type { GlyphName } from './internal';

export { isDueTone, isStatusTone, nextSortState, toDateValue, toStatusValue, toUserValue } from './types';
export type {
  CellAlign,
  DateValue,
  DueTone,
  SortDirection,
  SortState,
  StatusTone,
  StatusValue,
  TableCellRenderContext,
  TableCellValue,
  TableColumn,
  TableColumnType,
  TableRow,
  UserValue,
} from './types';
