// 資料展示組 · 共用型別與值正規化
//
// 來源：design git 的 `20_components/no2_data_display.jsx`。
//
// design 端是 JSX sandbox、值的形狀只寫在註解裡（`rows` 的 cell 可以是字串或
// `{ label, tone }`）。搬進 impl 後把那些註解升格成型別：
//   - 欄位定義、列資料、排序狀態各有具名 interface，畫面層拿得到編譯期檢查
//   - cell 值是異質集合，型別給 `TableCellValue` 聯集當文件，
//     實際取用一律經本檔的 `to*` 正規化函式，禁止 any、禁止裸轉型
//
// 排序受控：`nextSortState` 是「再點一次同一欄要變成什麼」的預設規則，
// 抽成具名匯出而非藏在 header 內，畫面層可沿用、也可完全換掉自己算。

import { isValidElement } from 'react';
import type { ReactNode } from 'react';

import type { Density, SemanticName, Theme } from '../../theme';

// ─── 值的形狀 ────────────────────────────────────────────────

/** 狀態色身份，與 theme 的 semantic 四色同名。 */
export type StatusTone = SemanticName;

/** 到期色身份。逾期與將到期分別吃 status 的 error_fg 與 warning_fg 深階。 */
export type DueTone = 'overdue' | 'soon';

export type CellAlign = 'left' | 'center' | 'right';

export interface StatusValue {
  readonly label: string;
  /** 省略即中性 badge。 */
  readonly tone?: StatusTone | undefined;
}

export interface UserValue {
  readonly name: string;
}

export interface DateValue {
  readonly label: string;
  readonly tone?: DueTone | undefined;
}

/**
 * 一格能放的值。
 * 走 `column.render` 的自訂欄位可以直接給節點，其餘型別由 `column.type` 決定怎麼讀。
 */
export type TableCellValue =
  | string
  | number
  | null
  | undefined
  | StatusValue
  | UserValue
  | DateValue
  | ReactNode;

// ─── 欄與列 ──────────────────────────────────────────────────

/** 欄位型別，決定套哪一個 TableCell 變體；`column.render` 存在時優先於本鍵。 */
export type TableColumnType = 'text' | 'key' | 'status' | 'user' | 'date' | 'number';

export interface TableCellRenderContext {
  readonly theme: Theme;
  readonly density: Density;
}

export interface TableColumn {
  readonly key: string;
  readonly label: string;
  /** 數字視為 px；字串直接當 grid track；省略時吃 COLUMN_MIN_WIDTH 的 1fr。 */
  readonly width?: number | string | undefined;
  readonly align?: CellAlign | undefined;
  readonly type?: TableColumnType | undefined;
  readonly sortable?: boolean | undefined;
  /** 文字欄專用，套 rowMutedFg。 */
  readonly muted?: boolean | undefined;
  /** key 欄的編號點擊；沿用 design 的原生事件語意。 */
  readonly onClick?: ((event: React.MouseEvent<HTMLSpanElement>) => void) | undefined;
  /** 自訂渲染，回傳節點即整格內容。 */
  readonly render?:
    | ((value: TableCellValue, row: TableRow, context: TableCellRenderContext) => ReactNode)
    | undefined;
}

export interface TableRow {
  readonly id: string;
  readonly cells: Readonly<Record<string, TableCellValue>>;
  readonly disabled?: boolean | undefined;
}

// ─── 排序 ────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly key: string;
  readonly direction: SortDirection;
}

/**
 * 點欄位標題時的預設下一個排序狀態：同欄升序轉降序，換欄回升序。
 * DataTable 只發出這個提議、不重排 `rows`；真正的比較邏輯在畫面層。
 */
export function nextSortState(current: SortState | null | undefined, key: string): SortState {
  const active = current != null && current.key === key;
  return { key, direction: active && current.direction === 'asc' ? 'desc' : 'asc' };
}

// ─── 值的正規化 ──────────────────────────────────────────────
// cell 值進元件前一律過這裡。輸入收 unknown、輸出是窄型別，
// 形狀不合就回 null 讓元件走「—」佔位，不丟例外、不讓畫面炸掉。

const STATUS_TONES: readonly StatusTone[] = ['success', 'warning', 'error', 'info'];
const DUE_TONES: readonly DueTone[] = ['overdue', 'soon'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isStatusTone(value: unknown): value is StatusTone {
  return typeof value === 'string' && STATUS_TONES.includes(value as StatusTone);
}

export function isDueTone(value: unknown): value is DueTone {
  return typeof value === 'string' && DUE_TONES.includes(value as DueTone);
}

/** 字串直接當 label；物件讀 label 與 tone。 */
export function toStatusValue(value: unknown): StatusValue | null {
  if (typeof value === 'string') return { label: value };
  if (isRecord(value)) {
    const label = value['label'];
    if (typeof label === 'string') {
      const tone = value['tone'];
      return isStatusTone(tone) ? { label, tone } : { label };
    }
  }
  return null;
}

/** 字串當姓名；物件讀 name。 */
export function toUserValue(value: unknown): UserValue | null {
  if (typeof value === 'string') return value.trim() === '' ? null : { name: value };
  if (isRecord(value)) {
    const name = value['name'];
    if (typeof name === 'string' && name.trim() !== '') return { name };
  }
  return null;
}

/** 字串當顯示文字；物件讀 label 與 tone。 */
export function toDateValue(value: unknown): DateValue | null {
  if (typeof value === 'string') return { label: value };
  if (isRecord(value)) {
    const label = value['label'];
    if (typeof label === 'string') {
      const tone = value['tone'];
      return isDueTone(tone) ? { label, tone } : { label };
    }
  }
  return null;
}

/**
 * 文字欄的值收斂成可渲染節點。
 * 字串、數字、React 元素原樣放行；資料物件退回它的 label 或 name，
 * 不讓誤放的物件把 React 渲染炸掉。陣列不在支援範圍，請走 `column.render`。
 */
export function toTextCellValue(value: TableCellValue): ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (isValidElement(value)) return value;
  return toPlainText(value);
}

/** 分組標籤與 title 屬性用；不是字串或數字就回空字串。 */
export function toPlainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (isRecord(value)) {
    const label = value['label'];
    if (typeof label === 'string') return label;
    const name = value['name'];
    if (typeof name === 'string') return name;
  }
  return '';
}
