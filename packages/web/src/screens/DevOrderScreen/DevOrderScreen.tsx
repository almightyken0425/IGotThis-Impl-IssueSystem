// DevOrderScreen · 開發順序表
//
// 角色：以主題單拖拉排序分配優先順序，並以甘特圖檢視各層級的工單排程。
// 首欄是主題單清單（已排序區在前、未排序區在後），次欄是甘特圖，兩欄逐列對齊。
//
// 來源：design git 的 `30_screens/no3_dev_order_screen/no3_dev_order_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no3_dev_order_screen.md
//
// 資料來源：依當前檢視（CurrentViewContext）查 /api/views/:id/issues，一次拿三個
// 顯示層級（主題/需求/工項）算好的甘特座標與時間軸；無當前檢視時顯示空狀態，不發
// 請求。MVP 工單種子尚未提供 StartTime／EndTime（workspace.ts 只有單一 due 欄位），
// 故目前所有主題單在三層都會呈現「已排入順序、未排程」，這是後端計算結果如實反映，
// 不是前端刻意隱藏。
//
// 排序拖曳：只接受「已排序區內重排」與「未排序拖進已排序」兩種落點，PUT
// /api/views/:id/sort/:issueId 寫入後端持久化排序值，成功後 reload 整批資料
// （不用 PUT 回傳的 entries 直接拼畫面，見 internal.tsx 對 dragLocked 的說明）。
// 「已排序拖回未排序」與「未排序內重排」不支援——後端 assignSortPosition 只能
// 指派位置、不能移出已排序區，也沒有對應的刪除端點。
//
// 消費元件：gantt（Toolbar / LevelSwitcher / GanttHeader / …）、data（EmptyState），
//           本檔私有的帶狀組裝件在 internal.tsx。

import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate } from 'react-router';

import { ApiError, viewsApi } from '../../api';
import type { DevOrderIssuesResult, TopicIssueRow } from '../../api';
import { useCurrentView } from '../../app/CurrentViewContext';
import { Chip, IconButton } from '../../components/controls';
import { EmptyState, FilterNotice } from '../../components/data';
import { GanttHeader, LevelSwitcher, Toolbar } from '../../components/gantt';
import { useAsync } from '../../hooks/useAsync';
import {
  FONT_FAMILY,
  NUMERIC_FONT_VARIANT,
  resolveGanttColors,
  TYPE_STYLES,
  useTheme,
} from '../../theme';
import { typeStyle } from '../typeStyle';
import {
  DEV_ORDER_DEFAULT_LEVEL,
  DEV_ORDER_LEVEL_BY_NUMBER,
  DEV_ORDER_LEVELS,
  rangeLabel,
} from './fixtures';
import type { DevOrderIssue, DevOrderLevelBars, DevOrderLevelId } from './fixtures';
import {
  DevOrderEmptyBoard,
  DevOrderHeaderLeading,
  DevOrderLegend,
  DevOrderRowBand,
  DevOrderSectionBand,
} from './internal';
import type { DevOrderRow } from './internal';
import { DEV_ORDER_SCREEN_TOKENS } from './tokens';

const T = DEV_ORDER_SCREEN_TOKENS;

/** 把後端 levels:[{level,bars}] 陣列換鍵成前端 {epic,story,task}；純換名，三態原樣搬過去。 */
function toDevOrderIssue(row: TopicIssueRow): DevOrderIssue {
  const levels: Record<DevOrderLevelId, DevOrderLevelBars> = { epic: null, story: null, task: null };
  for (const group of row.levels) {
    const levelId = DEV_ORDER_LEVEL_BY_NUMBER[group.level];
    if (levelId !== undefined) levels[levelId] = group.bars;
  }
  return { id: row.id, key: row.key, title: row.title, levels };
}

export function DevOrderScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const colors = resolveGanttColors(theme);
  const density = T.DENSITY;
  const listWidth = T.LIST_COLUMN_WIDTH;

  const { currentView } = useCurrentView();

  const fetcher = useCallback(async (): Promise<DevOrderIssuesResult | null> => {
    if (currentView === null) return null;
    return viewsApi.getDevOrderIssues(currentView.id);
  }, [currentView]);
  const { data, loading, error, reload } = useAsync(fetcher);

  const days = data?.days ?? [];
  const calendarLabel = data?.calendarName ?? '未設定日曆';

  const [level, setLevel] = useState<DevOrderLevelId>(DEV_ORDER_DEFAULT_LEVEL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | undefined>(undefined);

  // 點擊列或長條觸發。selectedId 除了驅動這裡的導覽，toRows 也讀它算 SortableRow／
  // GanttBar 的 selected 反白（見下方 toRows），故不能單純把 onSelect 換成導覽、
  // 移除 setSelectedId——兩個用途都要留著，這裡合併成一個 handler 同時做。
  const onSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      navigate(`/issues/${id}`);
    },
    [navigate],
  );

  const toRows = useCallback(
    (rows: readonly TopicIssueRow[]): readonly DevOrderRow[] =>
      rows.map((row) => ({
        issue: toDevOrderIssue(row),
        selected: row.id === selectedId,
        ghost: row.id === draggingId,
        pending: row.id === pendingId,
      })),
    [selectedId, draggingId, pendingId],
  );

  const sortedRows = useMemo(() => toRows(data?.sortedIssues ?? []), [toRows, data?.sortedIssues]);
  const unsortedRows = useMemo(
    () => toRows(data?.unsortedIssues ?? []),
    [toRows, data?.unsortedIssues],
  );
  const boardEmpty = sortedRows.length === 0 && unsortedRows.length === 0;

  const endDrag = useCallback(() => {
    setDraggingId(null);
    setDropIndex(null);
  }, []);

  const onDragStart = useCallback((id: string, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  }, []);

  const onDropIndexChange = useCallback(
    (index: number, event: DragEvent<HTMLElement>) => {
      if (draggingId === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropIndex((prev) => (prev === index ? prev : index));
    },
    [draggingId],
  );

  // targetIndex 是「把目標自己移出後」的插入位置（assignSortPosition 的既定契約，
  // 已對照 sortPosition.ts 的 others = sorted 濾掉 issueId 後的清單確認）：拖曳中
  // 若目標本來就在已排序區、且原位置在落點之前，插入點要扣掉自己那一格；從未排序
  // 拖入的情境目標不在已排序區內，落點不必調整。
  const commitDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const id = draggingId;
      const index = dropIndex;
      endDrag();
      if (id === null || index === null || currentView === null) return;

      const sortedIds = (data?.sortedIssues ?? []).map((row) => row.id);
      const removedAt = sortedIds.indexOf(id);
      const targetIndex = removedAt !== -1 && removedAt < index ? index - 1 : index;

      setDropError(undefined);
      setPendingId(id);
      try {
        await viewsApi.setSortPosition(currentView.id, id, targetIndex);
        await reload();
      } catch (err: unknown) {
        setDropError(err instanceof ApiError ? err.message : '排序更新失敗');
      } finally {
        setPendingId(null);
      }
    },
    [draggingId, dropIndex, endDrag, currentView, data?.sortedIssues, reload],
  );

  const dragLocked = pendingId !== null;

  const board = (
    <div
      style={{
        border: `${T.BOARD_BORDER_WIDTH}px solid ${colors.controlBorder}`,
        borderRadius: T.BOARD_RADIUS,
        overflow: 'hidden',
        background: colors.timelineBg,
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <div style={{ width: 'max-content' }}>
          <GanttHeader
            days={days}
            density={density}
            leadingWidth={listWidth}
            leading={<DevOrderHeaderLeading calendarName={calendarLabel} />}
          />

          <DevOrderSectionBand
            days={days}
            density={density}
            listWidth={listWidth}
            title="已排序"
            count={sortedRows.length}
            active={draggingId !== null}
            hint={draggingId !== null ? '放開即插入此區' : undefined}
            onDragOver={(event) => onDropIndexChange(0, event)}
            onDrop={(event) => void commitDrop(event)}
          />
          <DevOrderRowBand
            days={days}
            density={density}
            listWidth={listWidth}
            rows={sortedRows}
            levelId={level}
            dropIndex={dropIndex ?? undefined}
            dragLocked={dragLocked}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
            onDropIndexChange={onDropIndexChange}
            onDrop={(event) => void commitDrop(event)}
          />

          <DevOrderSectionBand
            days={days}
            density={density}
            listWidth={listWidth}
            title="未排序"
            count={unsortedRows.length}
            hint="拖入上方即排序"
          />
          <DevOrderRowBand
            days={days}
            density={density}
            listWidth={listWidth}
            rows={unsortedRows}
            levelId={level}
            showBars={false}
            dragLocked={dragLocked}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
          />
        </div>
      </div>

      <DevOrderLegend calendarName={calendarLabel} />
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        minHeight: T.FRAME_MIN_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: theme.bg.base,
        color: theme.text.primary,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      <Toolbar
        left={
          <span
            style={{
              ...typeStyle(TYPE_STYLES.caption),
              color: colors.textTertiary,
              fontVariantNumeric: NUMERIC_FONT_VARIANT,
              whiteSpace: 'nowrap',
            }}
          >
            {rangeLabel(days)}
          </span>
        }
        center={
          <LevelSwitcher
            levels={DEV_ORDER_LEVELS}
            value={level}
            onChange={(id) => setLevel(id as DevOrderLevelId)}
          />
        }
        right={
          <>
            <Chip label="日曆" value={calendarLabel} />
            <IconButton icon="dots" title="更多動作" />
          </>
        }
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: T.BODY_GAP,
          padding: T.BODY_PADDING,
        }}
      >
        {dropError !== undefined && (
          <span role="alert" style={{ ...typeStyle(TYPE_STYLES.caption), color: theme.status.error_fg }}>
            {dropError}
          </span>
        )}

        {currentView === null ? (
          <EmptyState
            title="尚無檢視"
            description="請先在左側「當前檢視」新增一張檢視，才能載入開發順序表。"
          />
        ) : error !== undefined ? (
          <EmptyState
            icon="clock"
            title="載入開發順序表失敗"
            description={error}
            action={{ label: '重試', onClick: () => void reload() }}
          />
        ) : loading && data === undefined ? (
          <span style={{ ...typeStyle(TYPE_STYLES.caption), color: colors.textTertiary }}>
            載入中…
          </span>
        ) : boardEmpty ? (
          <DevOrderEmptyBoard />
        ) : (
          board
        )}

        <FilterNotice count={data?.permissionExcludedCount} />
      </div>
    </div>
  );
}
