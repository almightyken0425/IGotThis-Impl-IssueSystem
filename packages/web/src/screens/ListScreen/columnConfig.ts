// ListScreen · 欄位顯示設定的純函式運算
//
// 對側 spec：no3_product_specs/no1_issue_system/no3_logics/no7_view_logic.md 的
// updateViewColumnConfig；no2_screens/no1_list_screen.md「調整欄位顯示設定」互動。
//
// Views.columnConfig 是後端從未驗證形狀的 opaque JSON（schema 為 `{}`），這個形狀
// 由本檔定案：{ columns: [{ key, width? }] }。陣列本身即顯示順序，只列「顯示中」
// 的欄位，未列出視為隱藏；width 省略即吃欄位目錄（LIST_COLUMNS）的預設寬。
//
// 不碰 React、不碰網路——畫面層（ListScreen.tsx）負責讀寫 currentView.columnConfig
// 與呼叫持久化 API，本檔只做資料轉換與陣列運算。

import type { TableColumn } from '../../components/data';

export interface ColumnConfigEntry {
  readonly key: string;
  readonly width?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidWidth(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function defaultEntries(catalog: readonly TableColumn[]): readonly ColumnConfigEntry[] {
  return catalog.map((column) => ({ key: column.key }));
}

/**
 * 解析檢視的 columnConfig。fail-open，比照 views.ts 的 parseFilterConfig 同一套
 * 精神：整體形狀不符（null／非物件／columns 非陣列）退回目錄全欄預設；單一項目
 * 不符（非物件／key 非字串／key 不在目錄內／重複 key）跳過該項，不因一項壞掉
 * 波及其餘；width 不合法時只丟寬度、保留該欄；篩完若結果為空（例如全部 key 都
 * 對不上目前目錄）一樣退回目錄全欄預設，不讓表格變成沒有任何欄。
 */
export function parseColumnConfig(
  raw: unknown,
  catalog: readonly TableColumn[],
): readonly ColumnConfigEntry[] {
  const fallback = defaultEntries(catalog);
  if (!isRecord(raw)) return fallback;

  const rawColumns = raw['columns'];
  if (!Array.isArray(rawColumns)) return fallback;

  const catalogKeys = new Set(catalog.map((column) => column.key));
  const seen = new Set<string>();
  const parsed: ColumnConfigEntry[] = [];

  for (const item of rawColumns) {
    if (!isRecord(item)) continue;
    const key = item['key'];
    if (typeof key !== 'string' || !catalogKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    const width = item['width'];
    parsed.push(isValidWidth(width) ? { key, width } : { key });
  }

  return parsed.length > 0 ? parsed : fallback;
}

/**
 * entries 映射成 DataTable 要的 TableColumn[]：向 catalog 查回 label/type/align/
 * sortable 等渲染 metadata，width 有覆寫值就疊上去，沒有就吃 catalog 的預設寬
 * （catalog 本身無數字寬度的彈性欄，覆寫缺席時原樣回傳 catalog 物件）。
 */
export function columnsFromConfig(
  entries: readonly ColumnConfigEntry[],
  catalog: readonly TableColumn[],
): readonly TableColumn[] {
  const byKey = new Map(catalog.map((column) => [column.key, column] as const));
  const result: TableColumn[] = [];
  for (const entry of entries) {
    const base = byKey.get(entry.key);
    if (base === undefined) continue;
    result.push(entry.width === undefined ? base : { ...base, width: entry.width });
  }
  return result;
}

/** entries 序列化成待寫回 Views.columnConfig 的 JSON。 */
export function toColumnConfigJson(entries: readonly ColumnConfigEntry[]): unknown {
  return { columns: entries };
}

/**
 * 切換一欄顯示/隱藏。已顯示且只剩它一欄時不動作（至少留一欄防呆，回傳原參照，
 * 呼叫端用 === 比對決定要不要觸發存檔）。切為顯示時附加到陣列尾端。key 不在
 * 目錄內時不動作。
 */
export function toggleColumnEntry(
  entries: readonly ColumnConfigEntry[],
  key: string,
  catalog: readonly TableColumn[],
): readonly ColumnConfigEntry[] {
  if (!catalog.some((column) => column.key === key)) return entries;

  const index = entries.findIndex((entry) => entry.key === key);
  if (index === -1) return [...entries, { key }];
  if (entries.length === 1) return entries;
  return entries.filter((entry) => entry.key !== key);
}

/** 在目前顯示中欄位的順序裡把一欄往前/往後移一位；已在邊界或 key 不存在於
 *  entries 內時不動作（回傳原參照）。 */
export function moveColumnEntry(
  entries: readonly ColumnConfigEntry[],
  key: string,
  direction: 'up' | 'down',
): readonly ColumnConfigEntry[] {
  const index = entries.findIndex((entry) => entry.key === key);
  if (index === -1) return entries;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= entries.length) return entries;

  const next = entries.slice();
  const moving = next[index]!;
  const target = next[targetIndex]!;
  next[index] = target;
  next[targetIndex] = moving;
  return next;
}

/**
 * 調整一欄寬度 delta px，下限 minWidth。base 值取既有覆寫，沒有就取 catalog 的
 * 數字寬度，catalog 也沒有（彈性欄）就取 minWidth。key 不存在於 entries 內時
 * 不動作（回傳原參照）。
 */
export function resizeColumnEntry(
  entries: readonly ColumnConfigEntry[],
  key: string,
  delta: number,
  catalog: readonly TableColumn[],
  minWidth: number,
): readonly ColumnConfigEntry[] {
  const index = entries.findIndex((entry) => entry.key === key);
  if (index === -1) return entries;

  const entry = entries[index]!;
  const catalogWidth = catalog.find((column) => column.key === key)?.width;
  const base = entry.width ?? (typeof catalogWidth === 'number' ? catalogWidth : minWidth);
  const width = Math.max(minWidth, base + delta);

  const next = entries.slice();
  next[index] = { key, width };
  return next;
}
