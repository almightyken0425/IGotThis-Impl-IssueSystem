// ListScreen · 清單表格畫面
//
// 角色：工單系統的主檢視。一列一張工單攤在表格上，工具列承載資料來源、篩選、
// 排序依據、分組依據與欄位顯示設定五個入口；被權限濾除的工單以標示列交代
// 筆數與原因，不靜默消失。
//
// 來源：design git 的 `30_screens/no1_list_screen/no1_list_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no1_list_screen.md
//
// 消費元件：
//   gantt/Toolbar                     工具列容器，左右兩區
//   controls/Select、Button、IconButton、Chip、Checkbox
//   data/DataTable、FilterNotice、EmptyState
//   Badge 與 Avatar 由 DataTable 的 status 與 user 兩型儲存格內部取用，本檔不直接呼叫。
//
// 與 design 的兩處差異：
//   1. variant 不搬。canvas 的四個 variant（default / empty / filtered / grouped）
//      是並排比較用的裝置；app 只有一組資料，那四種樣貌改由真實狀態產生——
//      換資料來源會濾出不同筆數、濾到零筆就走 EmptyState、分組依據選了就分組
//   2. 元件不再收 theme 參數。impl 的元件一律 useTheme 自取，畫面只在自己的
//      容器樣式上讀 theme
//
// 排序在本檔實作：DataTable 只負責標題列的排序指示與回呼，實際重排工單列
// 屬畫面職責（spec 互動「工單列依該欄位的值重新排列」）。排序、分組、資料來源、
// 欄位顯示設定皆為當次瀏覽狀態，存在 React state、不寫回檢視設定。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  Button,
  Checkbox,
  Chip,
  IconButton,
  Select,
} from '../../components/controls';
import { DataTable, EmptyState, FilterNotice } from '../../components/data';
import type { SortState, TableCellValue, TableColumn, TableRow } from '../../components/data';
import { Toolbar } from '../../components/gantt';
import {
  controlShadow,
  FONT_FAMILY,
  NUMERIC_FONT_VARIANT,
  useTheme,
} from '../../theme';
import type { Theme } from '../../theme';
import { typeStyle } from '../typeStyle';
import {
  LIST_COLUMNS,
  LIST_DEFAULT_SORT,
  LIST_DEFAULT_SOURCE,
  LIST_FILTERS,
  LIST_GROUP_NONE,
  LIST_GROUP_OPTIONS,
  LIST_PERMISSION_FILTERED,
  LIST_ROWS,
  LIST_SORT_OPTIONS,
  LIST_SOURCES,
  LIST_VIEW_NAME,
} from './fixtures';
import type { ListFilterChip, ListIssueRow, ListSourceId } from './fixtures';
import { LIST_SCREEN_TOKENS } from './tokens';

const T = LIST_SCREEN_TOKENS;

// ─── 排序 ────────────────────────────────────────────────────
// 儲存格值 → 可比較的純量。物件型的格（status / due）優先吃 sortKey，
// 沒有就退回 label；空值一律回 null，由 sortRows 恆置底。

function sortValue(raw: TableCellValue | undefined): number | string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' || typeof raw === 'string') return raw;
  if (typeof raw !== 'object') return null;

  const record = raw as unknown as Record<string, unknown>;
  const key = record['sortKey'];
  if (typeof key === 'number' || typeof key === 'string') return key;
  const label = record['label'];
  return typeof label === 'string' ? label : null;
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'zh-Hant');
}

/**
 * 空值不隨升降序翻面：未指派、無到期日永遠沉在最後，換序時不會冒到頂端。
 */
function sortRows<T extends TableRow>(rows: readonly T[], sort: SortState | null): readonly T[] {
  if (sort === null) return rows;
  const dir = sort.direction === 'desc' ? -1 : 1;
  return rows.slice().sort((ra, rb) => {
    const va = sortValue(ra.cells[sort.key]);
    const vb = sortValue(rb.cells[sort.key]);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return compare(va, vb) * dir;
  });
}

// ─── ViewTitle ─── 工具列最左的檢視名稱 + 筆數
// 區域性小元件：工具列左區要「名稱在上、筆數在下」的兩行塊，
// 現有元件組沒有對應件，且只有本畫面用得到，故留在畫面檔內。

interface ViewTitleProps {
  readonly theme: Theme;
  readonly name: string;
  readonly count: number;
}

function ViewTitle({ theme, name, count }: ViewTitleProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span
        style={{
          ...typeStyle(T.VIEW_TITLE_TYPE),
          color: theme.text.primary,
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <span
        style={{
          ...typeStyle(T.VIEW_META_TYPE),
          color: theme.text.tertiary,
          fontVariantNumeric: NUMERIC_FONT_VARIANT,
          whiteSpace: 'nowrap',
        }}
      >
        {`${count} 筆工單`}
      </span>
    </div>
  );
}

/** 工具列內的細直線，分開「檢視身份」與「資料來源」兩件事。 */
function ToolbarDivider({ theme }: { readonly theme: Theme }) {
  return (
    <span
      style={{
        width: T.TOOLBAR_DIVIDER_WIDTH,
        height: T.TOOLBAR_DIVIDER_HEIGHT,
        background: theme.divider.base,
        flexShrink: 0,
      }}
    />
  );
}

// ─── FilterChipBar ─── 已套用篩選條件列
// 區域性小元件：Chip 是單顆標籤，成列排放與說明文字沒有現成容器。
// 條件為空時不渲染本列。

interface FilterChipBarProps {
  readonly theme: Theme;
  readonly filters: readonly ListFilterChip[];
}

function FilterChipBar({ theme, filters }: FilterChipBarProps) {
  if (filters.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: T.CHIP_BAR_GAP,
        minHeight: T.CHIP_BAR_MIN_HEIGHT,
      }}
    >
      <span
        style={{
          ...typeStyle(T.VIEW_META_TYPE),
          color: theme.text.tertiary,
          whiteSpace: 'nowrap',
        }}
      >
        已套用篩選
      </span>
      {filters.map((f) => (
        <Chip key={`${f.label}-${f.value}`} label={f.label} value={f.value} />
      ))}
    </div>
  );
}

// ─── ColumnVisibilityPanel ─── 欄位顯示設定
// design 的欄位顯示設定只到「入口按鈕有 active 態」，面板內容未定案。
// impl 補最小可用形：一欄一個 Checkbox，取消勾選即從表格移除該欄。
// 至少留一欄——全隱藏後表格無從渲染，故最後一欄的 Checkbox 停用。

interface ColumnVisibilityPanelProps {
  readonly theme: Theme;
  readonly columns: readonly TableColumn[];
  readonly hidden: readonly string[];
  readonly onToggle: (key: string) => void;
}

function ColumnVisibilityPanel({ theme, columns, hidden, onToggle }: ColumnVisibilityPanelProps) {
  const shownCount = columns.length - hidden.length;
  return (
    <div
      role="group"
      aria-label="欄位顯示設定"
      style={{
        position: 'absolute',
        top: `calc(100% + ${T.COLUMN_PANEL_OFFSET}px)`,
        right: 0,
        zIndex: T.COLUMN_PANEL_Z,
        width: T.COLUMN_PANEL_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        gap: T.COLUMN_PANEL_GAP,
        padding: T.COLUMN_PANEL_PADDING,
        background: theme.bg.surface,
        border: `${T.COLUMN_PANEL_BORDER_WIDTH}px solid ${theme.border.base}`,
        borderRadius: T.COLUMN_PANEL_RADIUS,
        boxShadow: controlShadow(theme, 'level2'),
        fontFamily: FONT_FAMILY.base,
      }}
    >
      <span style={{ ...typeStyle(T.COLUMN_PANEL_TITLE_TYPE), color: theme.text.secondary }}>
        欄位顯示設定
      </span>
      {columns.map((column) => {
        const visible = !hidden.includes(column.key);
        return (
          <Checkbox
            key={column.key}
            label={column.label}
            checked={visible}
            disabled={visible && shownCount === 1}
            onChange={() => onToggle(column.key)}
          />
        );
      })}
      <span style={{ ...typeStyle(T.COLUMN_PANEL_HINT_TYPE), color: theme.text.tertiary }}>
        設定僅作用於當次瀏覽，不寫回檢視。
      </span>
    </div>
  );
}

// ─── ListScreen ──────────────────────────────────────────────

export function ListScreen() {
  const { theme } = useTheme();

  // 當次瀏覽狀態。五者都不持久化。
  const [sort, setSort] = useState<SortState | null>(LIST_DEFAULT_SORT);
  const [groupBy, setGroupBy] = useState<string>(LIST_GROUP_NONE);
  const [source, setSource] = useState<ListSourceId>(LIST_DEFAULT_SOURCE);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<readonly string[]>([]);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);

  const columnPanelAnchor = useRef<HTMLDivElement | null>(null);

  // 點面板以外的地方就收起。掛在 pointerdown 而非 click，
  // 才不會與 IconButton 自己的 click 切換打架。
  useEffect(() => {
    if (!columnPanelOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const anchor = columnPanelAnchor.current;
      if (anchor !== null && event.target instanceof Node && anchor.contains(event.target)) return;
      setColumnPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [columnPanelOpen]);

  const visibleRows = useMemo<readonly ListIssueRow[]>(
    () => (source === 'all' ? LIST_ROWS : LIST_ROWS.filter((row) => row.source === source)),
    [source],
  );

  const rows = useMemo(() => sortRows(visibleRows, sort), [visibleRows, sort]);

  const columns = useMemo(
    () => LIST_COLUMNS.filter((column) => !hiddenColumns.includes(column.key)),
    [hiddenColumns],
  );

  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const onRowSelect = useCallback((row: TableRow) => {
    setSelectedIds((ids) => (ids.includes(row.id) ? [] : [row.id]));
  }, []);

  // 分組依據若指向已隱藏的欄，分組標題會取不到值，故一併退回不分組。
  const effectiveGroupBy =
    groupBy !== LIST_GROUP_NONE && !hiddenColumns.includes(groupBy) ? groupBy : undefined;

  const toolbarLeft: ReactNode = (
    <>
      <ViewTitle theme={theme} name={LIST_VIEW_NAME} count={visibleRows.length} />
      <ToolbarDivider theme={theme} />
      <Select
        prefix="資料來源"
        options={LIST_SOURCES}
        value={source}
        onChange={(value) => setSource(value as ListSourceId)}
      />
    </>
  );

  const toolbarRight: ReactNode = (
    <>
      <Button variant="secondary" iconLeft="filter" label="篩選" />
      <Select
        prefix="排序"
        options={LIST_SORT_OPTIONS}
        value={sort?.key ?? ''}
        onChange={(key) => setSort({ key, direction: 'asc' })}
      />
      <Select prefix="分組" options={LIST_GROUP_OPTIONS} value={groupBy} onChange={setGroupBy} />
      <div ref={columnPanelAnchor} style={{ position: 'relative', display: 'inline-flex' }}>
        <IconButton
          icon="columns"
          title="欄位顯示設定"
          active={columnPanelOpen}
          onClick={() => setColumnPanelOpen((open) => !open)}
        />
        {columnPanelOpen && (
          <ColumnVisibilityPanel
            theme={theme}
            columns={LIST_COLUMNS}
            hidden={hiddenColumns}
            onToggle={toggleColumn}
          />
        )}
      </div>
    </>
  );

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.bg.base,
        color: theme.text.primary,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      {/* 檢視工具列 */}
      <Toolbar left={toolbarLeft} right={toolbarRight} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: T.SECTION_GAP,
          padding: `${T.CONTENT_PADDING_Y}px ${T.CONTENT_PADDING_X}px`,
        }}
      >
        <FilterChipBar theme={theme} filters={LIST_FILTERS} />

        {/* 權限過濾標示：count 為 0 時 FilterNotice 自身不渲染 */}
        <FilterNotice count={LIST_PERMISSION_FILTERED} reason="無讀取權" tone="info" />

        {/* 工單表格 */}
        <DataTable
          columns={columns}
          rows={rows}
          density={T.TABLE_DENSITY}
          sort={sort}
          onSortChange={setSort}
          groupBy={effectiveGroupBy}
          selectedIds={selectedIds}
          onRowSelect={onRowSelect}
          emptyState={
            <EmptyState
              title="沒有符合條件的工單"
              description="這個檢視的篩選條件目前沒有命中任何工單。放寬條件、換個資料來源，或直接建立一張。"
              action={{ label: '建立工單', icon: 'plus' }}
            />
          }
        />
      </div>
    </div>
  );
}
