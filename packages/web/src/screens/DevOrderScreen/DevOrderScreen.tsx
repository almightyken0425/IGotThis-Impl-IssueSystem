// DevOrderScreen · 開發順序表
//
// 角色：以主題單拖拉排序分配優先順序，並以甘特圖檢視各層級的工單排程。
// 首欄是主題單清單（已排序區在前、未排序區在後），次欄是甘特圖，兩欄逐列對齊。
//
// 來源：design git 的 `30_screens/no3_dev_order_screen/no3_dev_order_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no3_dev_order_screen.md
//
// 資料來源：改接真 API。主題單清單由 /api/workspace/issues 取回。工單的排程區間
// （StartTime / EndTime / 層級拆解）尚未落資料模型，故一律以「未排程」呈現——甘特
// 側只留格線與假日底，不畫長條。這是 design fixtures 已涵蓋的合法三態之一，非造假。
// 排序為當次瀏覽狀態，DevOrder 欄位的持久化待後續接上。
//
// 消費元件：gantt（Toolbar / LevelSwitcher / GanttHeader / …）、data（EmptyState），
//           本檔私有的帶狀組裝件在 internal.tsx。

import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';

import { workspaceApi } from '../../api';
import type { WorkspaceIssue } from '../../api';
import { Chip, IconButton } from '../../components/controls';
import { EmptyState } from '../../components/data';
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
  DEV_ORDER_CALENDAR_NAME,
  DEV_ORDER_DAYS,
  DEV_ORDER_DEFAULT_LEVEL,
  DEV_ORDER_LEVELS,
  rangeLabel,
} from './fixtures';
import type { DevOrderIssue, DevOrderLevelId } from './fixtures';
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

type SectionId = 'sorted' | 'unsorted';

interface DropTarget {
  readonly section: SectionId;
  readonly index: number;
}

/** 把 API 工單摺成主題單形狀：三層皆未排程（無長條），只呈現身份與順序。 */
function toDevOrderIssue(issue: WorkspaceIssue): DevOrderIssue {
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    sources: [],
    levels: { epic: [], story: null, task: null },
  };
}

export function DevOrderScreen() {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const days = DEV_ORDER_DAYS;
  const density = T.DENSITY;
  const listWidth = T.LIST_COLUMN_WIDTH;

  const { data, loading, error, reload } = useAsync(
    useCallback(() => workspaceApi.listIssues(), []),
  );

  const [level, setLevel] = useState<DevOrderLevelId>(DEV_ORDER_DEFAULT_LEVEL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 順序狀態：初始全部落已排序區，順序即列表回傳序。
  const [sortedIds, setSortedIds] = useState<readonly string[] | null>(null);
  const [unsortedIds, setUnsortedIds] = useState<readonly string[]>([]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const issueById = useMemo(() => {
    const map = new Map<string, DevOrderIssue>();
    for (const issue of data ?? []) map.set(issue.id, toDevOrderIssue(issue));
    return map;
  }, [data]);

  // 資料抵達後以列表序初始化已排序區；後續順序改動不被重抓覆蓋。
  const effectiveSorted = sortedIds ?? (data ?? []).map((i) => i.id);

  const toRows = useCallback(
    (ids: readonly string[]): readonly DevOrderRow[] =>
      ids.flatMap((id) => {
        const issue = issueById.get(id);
        if (issue === undefined) return [];
        return [{ issue, selected: id === selectedId, ghost: id === draggingId }];
      }),
    [issueById, selectedId, draggingId],
  );

  const sortedRows = useMemo(() => toRows(effectiveSorted), [toRows, effectiveSorted]);
  const unsortedRows = useMemo(() => toRows(unsortedIds), [toRows, unsortedIds]);
  const boardEmpty = sortedRows.length === 0 && unsortedRows.length === 0;

  const endDrag = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const onDragStart = useCallback((id: string, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  }, []);

  const onDropIndexChange = useCallback(
    (section: SectionId, index: number, event: DragEvent<HTMLElement>) => {
      if (draggingId === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget((prev) =>
        prev !== null && prev.section === section && prev.index === index
          ? prev
          : { section, index },
      );
    },
    [draggingId],
  );

  const commitDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const id = draggingId;
      const target = dropTarget;
      endDrag();
      if (id === null || target === null) return;

      const currentSorted = effectiveSorted;
      const from: SectionId = currentSorted.includes(id) ? 'sorted' : 'unsorted';
      const fromList = from === 'sorted' ? currentSorted : unsortedIds;
      const toList = target.section === 'sorted' ? currentSorted : unsortedIds;
      const removedAt = fromList.indexOf(id);
      if (removedAt === -1) return;

      const nextFrom = fromList.filter((x) => x !== id);
      const insertAt =
        from === target.section && removedAt < target.index ? target.index - 1 : target.index;

      if (from === target.section) {
        const next = [...nextFrom];
        next.splice(insertAt, 0, id);
        if (from === 'sorted') setSortedIds(next);
        else setUnsortedIds(next);
        return;
      }

      const nextTo = [...toList];
      nextTo.splice(insertAt, 0, id);
      if (from === 'sorted') {
        setSortedIds(nextFrom);
        setUnsortedIds(nextTo);
      } else {
        setUnsortedIds(nextFrom);
        setSortedIds(nextTo);
      }
    },
    [draggingId, dropTarget, endDrag, effectiveSorted, unsortedIds],
  );

  const dropIndexFor = (section: SectionId) =>
    dropTarget !== null && dropTarget.section === section ? dropTarget.index : undefined;

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
            leading={<DevOrderHeaderLeading calendarName={DEV_ORDER_CALENDAR_NAME} />}
          />

          <DevOrderSectionBand
            days={days}
            density={density}
            listWidth={listWidth}
            title="已排序"
            count={sortedRows.length}
            active={draggingId !== null}
            hint={draggingId !== null ? '放開即插入此區' : undefined}
            onDragOver={(event) => onDropIndexChange('sorted', 0, event)}
            onDrop={commitDrop}
          />
          <DevOrderRowBand
            days={days}
            density={density}
            listWidth={listWidth}
            rows={sortedRows}
            levelId={level}
            dropIndex={dropIndexFor('sorted')}
            onSelect={setSelectedId}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
            onDropIndexChange={(index, event) => onDropIndexChange('sorted', index, event)}
            onDrop={commitDrop}
          />

          <DevOrderSectionBand
            days={days}
            density={density}
            listWidth={listWidth}
            title="未排序"
            count={unsortedRows.length}
            hint="拖入上方即排序"
            onDragOver={(event) => onDropIndexChange('unsorted', 0, event)}
            onDrop={commitDrop}
          />
          <DevOrderRowBand
            days={days}
            density={density}
            listWidth={listWidth}
            rows={unsortedRows}
            levelId={level}
            showBars={false}
            dropIndex={dropIndexFor('unsorted')}
            onSelect={setSelectedId}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
            onDropIndexChange={(index, event) => onDropIndexChange('unsorted', index, event)}
            onDrop={commitDrop}
          />
        </div>
      </div>

      <DevOrderLegend calendarName={DEV_ORDER_CALENDAR_NAME} />
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
            <Chip label="日曆" value={DEV_ORDER_CALENDAR_NAME} />
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
        {error !== undefined ? (
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
      </div>
    </div>
  );
}
