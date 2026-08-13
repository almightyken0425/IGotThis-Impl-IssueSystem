// ListScreen · 清單表格畫面
//
// 角色：工單系統的主檢視。一列一張工單攤在表格上，工具列承載排序、分組與欄位
// 顯示設定；頂部提供建立工單入口——建立後即時回列表，是首波端到端驗收的核心。
//
// 來源：design git 的 `30_screens/no1_list_screen/no1_list_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no1_list_screen.md
//
// 資料來源：依當前檢視（CurrentViewContext）查 /api/views/:id/workspace-issues，
// 狀態值集合仍由 /api/workspace 的流程狀態決定（型別/流程定義是公司層級，非
// 檢視層級）。無當前檢視（帳號名下尚無檢視）時顯示空狀態，不發請求。原 design
// 的 variant 與假資料不搬——狀態差異由真實資料與互動產生。
//
// 已知限制：建立工單（submitCreate）寫入的是「工作區預設工單集」，不是當前
// 檢視的資料來源；詳見 submitCreate 上方註解。
//
// 消費元件：
//   gantt/Toolbar、controls（Select / Button / IconButton / Checkbox / TextInput）、
//   data（DataTable / EmptyState）。
//
// 排序、分組皆為當次瀏覽狀態，存在 React state、不寫回檢視設定。欄位顯示設定
// （顯示哪幾欄／欄序／欄寬）會寫回 Views.columnConfig，見 columnConfig.ts。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError, viewsApi, workspaceApi } from '../../api';
import type { WorkspaceContext, WorkspaceIssue } from '../../api';
import { useCurrentView } from '../../app/CurrentViewContext';
import { Button, Checkbox, IconButton, Select, TextInput } from '../../components/controls';
import { DataTable, EmptyState, FilterNotice } from '../../components/data';
import type {
  DueTone,
  SortState,
  StatusTone,
  TableCellValue,
  TableColumn,
  TableRow,
} from '../../components/data';
import { Toolbar } from '../../components/gantt';
import {
  controlShadow,
  DATA_DISPLAY_TOKENS,
  FONT_FAMILY,
  NUMERIC_FONT_VARIANT,
  SPACING,
  useTheme,
} from '../../theme';
import type { Theme } from '../../theme';
import { useAsync } from '../../hooks/useAsync';
import { typeStyle } from '../typeStyle';
import {
  columnsFromConfig,
  moveColumnEntry,
  parseColumnConfig,
  resizeColumnEntry,
  toColumnConfigJson,
  toggleColumnEntry,
} from './columnConfig';
import type { ColumnConfigEntry } from './columnConfig';
import {
  LIST_COLUMNS,
  LIST_DEFAULT_SORT,
  LIST_GROUP_NONE,
  LIST_GROUP_OPTIONS,
  LIST_SORT_OPTIONS,
} from './fixtures';
import { LIST_SCREEN_TOKENS } from './tokens';

const T = LIST_SCREEN_TOKENS;
// 欄寬調整下限：沿用 DataTable 未指定欄寬時的同一個下界，兩者語意上是同一件事
// ——欄寬不該小到不可用。
const COLUMN_WIDTH_MIN = DATA_DISPLAY_TOKENS.TABLE.COLUMN_MIN_WIDTH;

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

// ─── ColumnConfigPanel ────────────────────────────────────────
// 顯示/隱藏、順序（上下移動鈕）、寬度（+/- 鈕，僅目錄有數字寬度的欄開放）三組
// 控制。可視欄依目前顯示順序渲染（不是固定目錄順序）——按上移/下移時面板列要
// 跟著動，否則使用者看不出按鈕有反應。隱藏中的欄附加在最後，只給 checkbox。
// 上下鈕重用既有 chevron-up/down glyph，寬度鈕重用既有 minus/plus glyph，皆已
// 存在於 ControlGlyph，不新增視覺元素；面板本身的量體是既有的 impl 自訂範圍
// （design 的欄位顯示設定只到「按鈕有 active 態」，見 tokens.ts 開頭註解）。

interface ColumnConfigPanelProps {
  readonly theme: Theme;
  readonly catalog: readonly TableColumn[];
  readonly entries: readonly ColumnConfigEntry[];
  readonly widthStep: number;
  readonly widthMin: number;
  readonly error: string | undefined;
  readonly onToggle: (key: string) => void;
  readonly onMove: (key: string, direction: 'up' | 'down') => void;
  readonly onWidthChange: (key: string, delta: number) => void;
}

function ColumnConfigPanel({
  theme,
  catalog,
  entries,
  widthStep,
  widthMin,
  error,
  onToggle,
  onMove,
  onWidthChange,
}: ColumnConfigPanelProps) {
  const visibleKeys = new Set(entries.map((entry) => entry.key));
  const hiddenColumns = catalog.filter((column) => !visibleKeys.has(column.key));

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

      {entries.map((entry, index) => {
        const column = catalog.find((c) => c.key === entry.key);
        if (column === undefined) return null;
        const catalogWidth = typeof column.width === 'number' ? column.width : undefined;
        const effectiveWidth = entry.width ?? catalogWidth;
        return (
          <div
            key={entry.key}
            style={{ display: 'flex', alignItems: 'center', gap: T.COLUMN_PANEL_ROW_GAP }}
          >
            <Checkbox
              label={column.label}
              checked
              disabled={entries.length === 1}
              onChange={() => onToggle(entry.key)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <IconButton
              icon="chevron-up"
              title={`上移${column.label}`}
              size="sm"
              disabled={index === 0}
              onClick={() => onMove(entry.key, 'up')}
            />
            <IconButton
              icon="chevron-down"
              title={`下移${column.label}`}
              size="sm"
              disabled={index === entries.length - 1}
              onClick={() => onMove(entry.key, 'down')}
            />
            {catalogWidth !== undefined && (
              <>
                <IconButton
                  icon="minus"
                  title={`縮小${column.label}欄寬`}
                  size="sm"
                  disabled={effectiveWidth !== undefined && effectiveWidth <= widthMin}
                  onClick={() => onWidthChange(entry.key, -widthStep)}
                />
                <IconButton
                  icon="plus"
                  title={`加大${column.label}欄寬`}
                  size="sm"
                  onClick={() => onWidthChange(entry.key, widthStep)}
                />
              </>
            )}
          </div>
        );
      })}

      {hiddenColumns.map((column) => (
        <Checkbox
          key={column.key}
          label={column.label}
          checked={false}
          onChange={() => onToggle(column.key)}
        />
      ))}

      {error !== undefined && (
        <span style={{ ...typeStyle(T.COLUMN_PANEL_HINT_TYPE), color: theme.status.error_fg }}>
          {error}
        </span>
      )}
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
  const { currentView, updateView } = useCurrentView();

  const fetcher = useCallback(
    async (): Promise<
      | {
          context: WorkspaceContext;
          issues: readonly WorkspaceIssue[];
          permissionExcludedCount: number;
        }
      | null
    > => {
      if (currentView === null) return null;
      const [context, workspaceIssues] = await Promise.all([
        workspaceApi.getWorkspace(),
        viewsApi.getWorkspaceIssues(currentView.id),
      ]);
      return {
        context,
        issues: workspaceIssues.issues,
        permissionExcludedCount: workspaceIssues.permissionExcludedCount,
      };
    },
    // 只用到 currentView.id：換一張檢視（id 變）才需要重抓整份工單清單。
    // 不能拿整個 currentView 物件當依賴——persistColumnConfig 存檔後會觸發
    // CurrentViewContext 的 reload，讓 currentView 換成新物件參照（id 不變、
    // 只有 columnConfig 變），若依賴整個物件會被誤判成「換檢視」，白白多打一次
    // workspace 與 workspace-issues 兩支 API 重抓整份工單清單。
    [currentView?.id],
  );
  const { data, loading, error, reload } = useAsync(fetcher);

  // 當次瀏覽狀態：排序、分組不寫回。
  const [sort, setSort] = useState<SortState | null>(LIST_DEFAULT_SORT);
  const [groupBy, setGroupBy] = useState<string>(LIST_GROUP_NONE);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

  // 欄位顯示設定草稿：初始值與切換檢視時都由 currentView.columnConfig 解析；
  // 每次互動立即反映在畫面上（樂觀更新），同時觸發 persistColumnConfig 寫回。
  const [columnConfigDraft, setColumnConfigDraft] = useState<readonly ColumnConfigEntry[]>(() =>
    parseColumnConfig(currentView?.columnConfig, LIST_COLUMNS),
  );
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  const columnPanelAnchor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setColumnConfigDraft(parseColumnConfig(currentView?.columnConfig, LIST_COLUMNS));
    setSaveError(undefined);
  }, [currentView?.id]);

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
    () => columnsFromConfig(columnConfigDraft, LIST_COLUMNS),
    [columnConfigDraft],
  );

  // 樂觀更新：本地草稿立即反映，失敗只記錯誤不回滾——使用者已經看到變更生效，
  // 回滾會製造「明明點了卻又跳回去」的錯覺，錯誤訊息已足夠交代狀況。
  const persistColumnConfig = useCallback(
    async (next: readonly ColumnConfigEntry[]) => {
      if (currentView === null) return;
      setSaveError(undefined);
      try {
        await updateView(currentView.id, { columnConfig: toColumnConfigJson(next) });
      } catch (err: unknown) {
        setSaveError(err instanceof ApiError ? err.message : '欄位顯示設定儲存失敗');
      }
    },
    [currentView, updateView],
  );

  // 三個 handler 直接讀 closure 內的 columnConfigDraft（列進 useCallback 依賴），
  // 不包在 setState 的函式型更新裡——main.tsx 有 <StrictMode>，若把
  // persistColumnConfig 這類副作用混進 updater，開發模式下會被重複呼叫兩次，
  // 對同一次點擊多打一支重複的 PATCH。
  const toggleColumn = useCallback(
    (key: string) => {
      const next = toggleColumnEntry(columnConfigDraft, key, LIST_COLUMNS);
      if (next === columnConfigDraft) return;
      setColumnConfigDraft(next);
      void persistColumnConfig(next);
    },
    [columnConfigDraft, persistColumnConfig],
  );

  const moveColumn = useCallback(
    (key: string, direction: 'up' | 'down') => {
      const next = moveColumnEntry(columnConfigDraft, key, direction);
      if (next === columnConfigDraft) return;
      setColumnConfigDraft(next);
      void persistColumnConfig(next);
    },
    [columnConfigDraft, persistColumnConfig],
  );

  const adjustColumnWidth = useCallback(
    (key: string, delta: number) => {
      const next = resizeColumnEntry(columnConfigDraft, key, delta, LIST_COLUMNS, COLUMN_WIDTH_MIN);
      if (next === columnConfigDraft) return;
      setColumnConfigDraft(next);
      void persistColumnConfig(next);
    },
    [columnConfigDraft, persistColumnConfig],
  );

  const onRowSelect = useCallback((row: TableRow) => {
    setSelectedIds((ids) => (ids.includes(row.id) ? [] : [row.id]));
  }, []);

  const visibleColumnKeys = useMemo(
    () => new Set(columnConfigDraft.map((entry) => entry.key)),
    [columnConfigDraft],
  );
  const effectiveGroupBy =
    groupBy !== LIST_GROUP_NONE && visibleColumnKeys.has(groupBy) ? groupBy : undefined;

  // 已知限制：寫入的是「工作區預設工單集」（ensureWorkspace 決定的單一
  // IssueSet），不是 currentView.sourceMgmtIds 指向的任意資料來源。目前前端
  // 沒有建立額外 Team/Product/Mgmt 的入口（containers.ts 只封裝唯讀查詢），
  // 每個 Company 只有一顆預設 Mgmt，新增檢視的組織範圍選擇必然以它為 scope，
  // 兩者恆一致，這個邊界目前不可觸發。等前端開放建立多個 Mgmt 時需重新檢視。
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

  const viewName = currentView?.name ?? '工單清單';

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
          disabled={currentView === null}
          onClick={() => setColumnPanelOpen((open) => !open)}
        />
        {columnPanelOpen && (
          <ColumnConfigPanel
            theme={theme}
            catalog={LIST_COLUMNS}
            entries={columnConfigDraft}
            widthStep={T.COLUMN_PANEL_WIDTH_STEP}
            widthMin={COLUMN_WIDTH_MIN}
            error={saveError}
            onToggle={toggleColumn}
            onMove={moveColumn}
            onWidthChange={adjustColumnWidth}
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
        <FilterNotice count={data?.permissionExcludedCount} />

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

        {currentView === null ? (
          <EmptyState
            title="尚無檢視"
            description="請先在左側「當前檢視」新增一張檢視，才能載入工單清單。"
          />
        ) : error !== undefined ? (
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
