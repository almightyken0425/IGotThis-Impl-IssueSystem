// ListScreen · 清單表格畫面
//
// 角色：工單系統的主檢視。一列一張工單攤在表格上，工具列承載排序、分組與欄位
// 顯示設定；頂部提供建立工單入口——建立後即時回列表，是首波端到端驗收的核心。
//
// 來源：design git 的 `30_screens/no1_list_screen/no1_list_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no1_list_screen.md
//
// 資料來源：改接真 API。工單列由 /api/workspace/issues 取回，狀態值集合由
// /api/workspace 的流程狀態決定。原 design 的 variant 與假資料不搬——狀態差異
// 由真實資料與互動產生。
//
// 消費元件：
//   gantt/Toolbar、controls（Select / Button / IconButton / Checkbox / TextInput）、
//   data（DataTable / EmptyState）。
//
// 排序、分組、欄位顯示設定皆為當次瀏覽狀態，存在 React state、不寫回檢視設定。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { workspaceApi } from '../../api';
import type { WorkspaceContext, WorkspaceIssue } from '../../api';
import { Button, Checkbox, IconButton, Select, TextInput } from '../../components/controls';
import { DataTable, EmptyState } from '../../components/data';
import type {
  DueTone,
  SortState,
  StatusTone,
  TableCellValue,
  TableColumn,
  TableRow,
} from '../../components/data';
import { Toolbar } from '../../components/gantt';
import { controlShadow, FONT_FAMILY, NUMERIC_FONT_VARIANT, SPACING, useTheme } from '../../theme';
import type { Theme } from '../../theme';
import { useAsync } from '../../hooks/useAsync';
import { typeStyle } from '../typeStyle';
import {
  LIST_COLUMNS,
  LIST_DEFAULT_SORT,
  LIST_GROUP_NONE,
  LIST_GROUP_OPTIONS,
  LIST_SORT_OPTIONS,
} from './fixtures';
import { LIST_SCREEN_TOKENS } from './tokens';

const T = LIST_SCREEN_TOKENS;

// ─── 狀態值 → 表格格 ─────────────────────────────────────────
// 狀態的顯示順序與色彩身份由工作區流程狀態決定：終止狀態走 success，其餘依名稱
// 與位置給一個 tone，讓排序與分組有穩定次序，不落字典序。

interface StatusMeta {
  readonly sortKey: number;
  readonly tone: StatusTone | undefined;
}

function toneForStatus(name: string, index: number, isTerminal: boolean): StatusTone | undefined {
  if (isTerminal) return 'success';
  if (name.includes('阻')) return 'error';
  if (name.includes('審') || name.includes('驗')) return 'warning';
  if (index >= 1) return 'info';
  return undefined;
}

function buildStatusMeta(
  statuses: WorkspaceContext['statuses'],
): ReadonlyMap<string, StatusMeta> {
  const map = new Map<string, StatusMeta>();
  statuses.forEach((s, index) => {
    map.set(s.name, { sortKey: index, tone: toneForStatus(s.name, index, s.isTerminal) });
  });
  return map;
}

// ─── 到期日 → 表格格 ─────────────────────────────────────────
// ISO 日期轉「MM/DD」顯示；已過期標 overdue、七日內標 soon，其餘中性。

const DAY_MS = 24 * 60 * 60 * 1000;

function dueTone(iso: string): DueTone | undefined {
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'soon';
  return undefined;
}

// 帶 sortKey 的格值：sortKey 供畫面端排序讀取，DataTable 正規化時會忽略未知鍵。
interface StatusCell {
  readonly label: string;
  readonly sortKey: number;
  readonly tone?: StatusTone;
}
interface DueCell {
  readonly label: string;
  readonly sortKey: string;
  readonly tone?: DueTone;
}

function dueCell(iso: string | null): DueCell | null {
  if (iso === null) return null;
  const target = new Date(`${iso}T00:00:00`);
  const label = Number.isNaN(target.getTime())
    ? iso
    : `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}`;
  const tone = dueTone(iso);
  return tone === undefined ? { label, sortKey: iso } : { label, sortKey: iso, tone };
}

/** 把 API 工單摺成表格列。 */
function toTableRow(issue: WorkspaceIssue, statusMeta: ReadonlyMap<string, StatusMeta>): TableRow {
  const meta = statusMeta.get(issue.status);
  const status: StatusCell = {
    label: issue.status,
    sortKey: meta?.sortKey ?? 0,
    ...(meta?.tone === undefined ? {} : { tone: meta.tone }),
  };
  return {
    id: issue.id,
    cells: {
      key: issue.key,
      title: issue.title,
      status,
      assignee: issue.assignee,
      point: issue.point,
      due: dueCell(issue.due),
    },
  };
}

// ─── 排序 ────────────────────────────────────────────────────

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

/** 空值不隨升降序翻面：未指派、無到期日永遠沉在最後。 */
function sortRows(rows: readonly TableRow[], sort: SortState | null): readonly TableRow[] {
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

// ─── ViewTitle ───────────────────────────────────────────────

interface ViewTitleProps {
  readonly theme: Theme;
  readonly name: string;
  readonly count: number;
}

function ViewTitle({ theme, name, count }: ViewTitleProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ ...typeStyle(T.VIEW_TITLE_TYPE), color: theme.text.primary, whiteSpace: 'nowrap' }}>
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

// ─── ColumnVisibilityPanel ───────────────────────────────────

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

// ─── CreateIssueBar ── 建立工單的行內入口
// design 尚無定案的建立表單；impl 補最小可用形：標題輸入 + 送出，成功即回列表。

interface CreateIssueBarProps {
  readonly theme: Theme;
  readonly submitting: boolean;
  readonly error: string | undefined;
  readonly onSubmit: (title: string) => void;
  readonly onCancel: () => void;
}

function CreateIssueBar({ theme, submitting, error, onSubmit, onCancel }: CreateIssueBarProps) {
  const [title, setTitle] = useState('');
  const submit = () => {
    const trimmed = title.trim();
    if (trimmed === '') return;
    onSubmit(trimmed);
    setTitle('');
  };
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !submitting) submit();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACING.sm,
        padding: SPACING.sm,
        background: theme.bg.surface,
        border: `1px solid ${theme.border.base}`,
        borderRadius: T.COLUMN_PANEL_RADIUS,
      }}
    >
      <TextInput
        leadingIcon="plus"
        placeholder="輸入工單標題後按 Enter 建立"
        value={title}
        onChange={setTitle}
        fullWidth
        style={{ flex: 1 }}
      />
      <Button variant="primary" label="建立" loading={submitting} onClick={submit} />
      <Button variant="ghost" label="取消" onClick={onCancel} />
      {error !== undefined && (
        <span style={{ ...typeStyle(T.VIEW_META_TYPE), color: theme.status.error_fg }}>{error}</span>
      )}
    </div>
  );
}

// ─── ListScreen ──────────────────────────────────────────────

export function ListScreen() {
  const { theme } = useTheme();

  const fetcher = useCallback(
    async (): Promise<{ context: WorkspaceContext; issues: readonly WorkspaceIssue[] }> => {
      const [context, issues] = await Promise.all([
        workspaceApi.getWorkspace(),
        workspaceApi.listIssues(),
      ]);
      return { context, issues };
    },
    [],
  );
  const { data, loading, error, reload } = useAsync(fetcher);

  // 當次瀏覽狀態。
  const [sort, setSort] = useState<SortState | null>(LIST_DEFAULT_SORT);
  const [groupBy, setGroupBy] = useState<string>(LIST_GROUP_NONE);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<readonly string[]>([]);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  const columnPanelAnchor = useRef<HTMLDivElement | null>(null);

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

  const statusMeta = useMemo(
    () => buildStatusMeta(data?.context.statuses ?? []),
    [data?.context.statuses],
  );

  const allRows = useMemo<readonly TableRow[]>(
    () => (data?.issues ?? []).map((issue) => toTableRow(issue, statusMeta)),
    [data?.issues, statusMeta],
  );

  const rows = useMemo(() => sortRows(allRows, sort), [allRows, sort]);

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

  const effectiveGroupBy =
    groupBy !== LIST_GROUP_NONE && !hiddenColumns.includes(groupBy) ? groupBy : undefined;

  const submitCreate = useCallback(
    async (title: string) => {
      setCreating(true);
      setCreateError(undefined);
      try {
        await workspaceApi.createIssue({ title });
        await reload();
        setCreateOpen(false);
      } catch (err: unknown) {
        setCreateError(err instanceof Error ? err.message : '建立失敗');
      } finally {
        setCreating(false);
      }
    },
    [reload],
  );

  const viewName = data?.context.issueSet.name ?? '工單清單';

  const toolbarLeft: ReactNode = <ViewTitle theme={theme} name={viewName} count={allRows.length} />;

  const toolbarRight: ReactNode = (
    <>
      <Button
        variant="primary"
        iconLeft="plus"
        label="建立工單"
        onClick={() => setCreateOpen((open) => !open)}
      />
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
      <Toolbar left={toolbarLeft} right={toolbarRight} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: T.SECTION_GAP,
          padding: `${T.CONTENT_PADDING_Y}px ${T.CONTENT_PADDING_X}px`,
        }}
      >
        {createOpen && (
          <CreateIssueBar
            theme={theme}
            submitting={creating}
            error={createError}
            onSubmit={(title) => void submitCreate(title)}
            onCancel={() => {
              setCreateOpen(false);
              setCreateError(undefined);
            }}
          />
        )}

        {error !== undefined ? (
          <EmptyState
            icon="clock"
            title="載入工單失敗"
            description={error}
            action={{ label: '重試', onClick: () => void reload() }}
          />
        ) : loading && data === undefined ? (
          <div style={{ ...typeStyle(T.VIEW_META_TYPE), color: theme.text.tertiary }}>載入中…</div>
        ) : (
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
                title="還沒有工單"
                description="這個工單集目前是空的。點右上角「建立工單」開出第一張。"
                action={{ label: '建立工單', icon: 'plus', onClick: () => setCreateOpen(true) }}
              />
            }
          />
        )}
      </div>
    </div>
  );
}
