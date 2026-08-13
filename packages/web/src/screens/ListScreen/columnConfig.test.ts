import { describe, expect, it } from 'vitest';

import {
  columnsFromConfig,
  moveColumnEntry,
  parseColumnConfig,
  resizeColumnEntry,
  toColumnConfigJson,
  toggleColumnEntry,
} from './columnConfig';
import type { TableColumn } from '../../components/data';

// 標題欄刻意不給 width，比對真實 LIST_COLUMNS 的彈性欄（吃 DataTable 的 1fr fallback）。
const CATALOG: readonly TableColumn[] = [
  { key: 'key', label: '編號', type: 'key', width: 96, sortable: true },
  { key: 'title', label: '標題', type: 'text', sortable: true },
  { key: 'status', label: '狀態', type: 'status', width: 120, sortable: true },
];

const DEFAULT_ENTRIES = [{ key: 'key' }, { key: 'title' }, { key: 'status' }];

describe('parseColumnConfig', () => {
  it('null 退回目錄預設（全欄、目錄順序、無寬度覆寫）', () => {
    expect(parseColumnConfig(null, CATALOG)).toEqual(DEFAULT_ENTRIES);
  });

  it('undefined 退回目錄預設', () => {
    expect(parseColumnConfig(undefined, CATALOG)).toEqual(DEFAULT_ENTRIES);
  });

  it('非物件（字串／數字）退回目錄預設', () => {
    expect(parseColumnConfig('bad', CATALOG)).toEqual(DEFAULT_ENTRIES);
    expect(parseColumnConfig(42, CATALOG)).toEqual(DEFAULT_ENTRIES);
  });

  it('物件但缺 columns 陣列退回目錄預設', () => {
    expect(parseColumnConfig({}, CATALOG)).toEqual(DEFAULT_ENTRIES);
    expect(parseColumnConfig({ columns: 'not-array' }, CATALOG)).toEqual(DEFAULT_ENTRIES);
  });

  it('columns 為空陣列時，結果為空，退回目錄預設', () => {
    expect(parseColumnConfig({ columns: [] }, CATALOG)).toEqual(DEFAULT_ENTRIES);
  });

  it('合法 entries 依原順序保留，此順序即顯示順序', () => {
    expect(parseColumnConfig({ columns: [{ key: 'status' }, { key: 'key' }] }, CATALOG)).toEqual([
      { key: 'status' },
      { key: 'key' },
    ]);
  });

  it('key 不在目錄內的項目被跳過，其餘照常保留', () => {
    expect(
      parseColumnConfig({ columns: [{ key: 'title' }, { key: 'ghost' }] }, CATALOG),
    ).toEqual([{ key: 'title' }]);
  });

  it('非物件的陣列項目被跳過', () => {
    expect(parseColumnConfig({ columns: ['title', { key: 'status' }] }, CATALOG)).toEqual([
      { key: 'status' },
    ]);
  });

  it('key 非字串的項目被跳過', () => {
    expect(parseColumnConfig({ columns: [{ key: 42 }, { key: 'title' }] }, CATALOG)).toEqual([
      { key: 'title' },
    ]);
  });

  it('重複 key 只保留第一次出現', () => {
    expect(
      parseColumnConfig({ columns: [{ key: 'title' }, { key: 'title' }] }, CATALOG),
    ).toEqual([{ key: 'title' }]);
  });

  it('width 為合法正數時保留', () => {
    expect(parseColumnConfig({ columns: [{ key: 'status', width: 200 }] }, CATALOG)).toEqual([
      { key: 'status', width: 200 },
    ]);
  });

  it('width 不合法（非數字／負數／NaN）時該項仍保留、只丟寬度', () => {
    expect(parseColumnConfig({ columns: [{ key: 'status', width: '200' }] }, CATALOG)).toEqual([
      { key: 'status' },
    ]);
    expect(parseColumnConfig({ columns: [{ key: 'status', width: -1 }] }, CATALOG)).toEqual([
      { key: 'status' },
    ]);
    expect(parseColumnConfig({ columns: [{ key: 'status', width: NaN }] }, CATALOG)).toEqual([
      { key: 'status' },
    ]);
  });

  it('篩完若結果為空（全部項目都不合法）退回目錄預設', () => {
    expect(parseColumnConfig({ columns: [{ key: 'ghost' }] }, CATALOG)).toEqual(DEFAULT_ENTRIES);
  });
});

describe('columnsFromConfig', () => {
  it('依 entries 順序映射回完整 TableColumn，帶目錄的 label/type/align/sortable', () => {
    const result = columnsFromConfig([{ key: 'status' }, { key: 'key' }], CATALOG);
    expect(result).toEqual([
      { key: 'status', label: '狀態', type: 'status', width: 120, sortable: true },
      { key: 'key', label: '編號', type: 'key', width: 96, sortable: true },
    ]);
  });

  it('entry 帶 width 覆寫目錄的預設寬', () => {
    const result = columnsFromConfig([{ key: 'status', width: 200 }], CATALOG);
    expect(result[0]?.width).toBe(200);
  });

  it('entry 無 width 覆寫時吃目錄預設寬（含目錄本身無寬度的彈性欄）', () => {
    const result = columnsFromConfig([{ key: 'title' }], CATALOG);
    expect(result[0]?.width).toBeUndefined();
  });

  it('entry 的 key 不在目錄內時整項跳過', () => {
    expect(columnsFromConfig([{ key: 'ghost' }, { key: 'title' }], CATALOG)).toEqual([
      { key: 'title', label: '標題', type: 'text', sortable: true },
    ]);
  });
});

describe('toColumnConfigJson', () => {
  it('包成 { columns } 的形狀，原樣保留 entries', () => {
    const entries = [{ key: 'title' }, { key: 'status', width: 150 }];
    expect(toColumnConfigJson(entries)).toEqual({ columns: entries });
  });
});

describe('toggleColumnEntry', () => {
  it('切換隱藏中的欄位會附加到顯示順序尾端', () => {
    const entries = [{ key: 'key' }, { key: 'title' }];
    expect(toggleColumnEntry(entries, 'status', CATALOG)).toEqual([
      { key: 'key' },
      { key: 'title' },
      { key: 'status' },
    ]);
  });

  it('切換顯示中的欄位（非最後一欄）會移除它', () => {
    const entries = [{ key: 'key' }, { key: 'title' }, { key: 'status' }];
    expect(toggleColumnEntry(entries, 'title', CATALOG)).toEqual([
      { key: 'key' },
      { key: 'status' },
    ]);
  });

  it('只剩一欄顯示時切換該欄不動作，回傳原參照', () => {
    const entries = [{ key: 'title' }];
    expect(toggleColumnEntry(entries, 'title', CATALOG)).toBe(entries);
  });

  it('key 不存在於目錄內時不動作，回傳原參照', () => {
    const entries = [{ key: 'key' }];
    expect(toggleColumnEntry(entries, 'ghost', CATALOG)).toBe(entries);
  });
});

describe('moveColumnEntry', () => {
  const entries = [{ key: 'key' }, { key: 'title' }, { key: 'status' }];

  it('up 從中間位置與前一項互換', () => {
    expect(moveColumnEntry(entries, 'title', 'up')).toEqual([
      { key: 'title' },
      { key: 'key' },
      { key: 'status' },
    ]);
  });

  it('down 從中間位置與後一項互換', () => {
    expect(moveColumnEntry(entries, 'title', 'down')).toEqual([
      { key: 'key' },
      { key: 'status' },
      { key: 'title' },
    ]);
  });

  it('已在最前時 up 不動作，回傳原參照', () => {
    expect(moveColumnEntry(entries, 'key', 'up')).toBe(entries);
  });

  it('已在最後時 down 不動作，回傳原參照', () => {
    expect(moveColumnEntry(entries, 'status', 'down')).toBe(entries);
  });

  it('key 不存在於 entries 內時不動作，回傳原參照', () => {
    expect(moveColumnEntry(entries, 'ghost', 'up')).toBe(entries);
  });
});

describe('resizeColumnEntry', () => {
  it('已有寬度覆寫時，delta 疊加在既有覆寫值上', () => {
    const entries = [{ key: 'status', width: 120 }];
    expect(resizeColumnEntry(entries, 'status', 20, CATALOG, 80)).toEqual([
      { key: 'status', width: 140 },
    ]);
  });

  it('尚無寬度覆寫時，base 值取目錄的預設寬', () => {
    const entries = [{ key: 'status' }];
    expect(resizeColumnEntry(entries, 'status', 20, CATALOG, 80)).toEqual([
      { key: 'status', width: 140 },
    ]);
  });

  it('目錄也沒有數字寬度時（彈性欄），base 值取下限', () => {
    const entries = [{ key: 'title' }];
    expect(resizeColumnEntry(entries, 'title', 20, CATALOG, 80)).toEqual([
      { key: 'title', width: 100 },
    ]);
  });

  it('縮小結果低於下限時，夾在下限', () => {
    const entries = [{ key: 'status', width: 90 }];
    expect(resizeColumnEntry(entries, 'status', -50, CATALOG, 80)).toEqual([
      { key: 'status', width: 80 },
    ]);
  });

  it('key 不存在於 entries 內時不動作，回傳原參照', () => {
    const entries = [{ key: 'status' }];
    expect(resizeColumnEntry(entries, 'ghost', 20, CATALOG, 80)).toBe(entries);
  });
});
