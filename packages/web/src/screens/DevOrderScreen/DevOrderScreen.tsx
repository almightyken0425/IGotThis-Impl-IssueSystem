// DevOrderScreen · 開發順序表
//
// 角色：以主題單拖拉排序分配優先順序，並以甘特圖檢視各層級的工單排程。
// 首欄是主題單清單（已排序區在前、未排序區在後），次欄是甘特圖，兩欄逐列對齊。
//
// 來源：design git 的 `30_screens/no3_dev_order_screen/no3_dev_order_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no3_dev_order_screen.md
//
// 消費元件：
//   gantt/Toolbar、LevelSwitcher、GanttHeader、GanttTimeline、GanttBar、
//         SortableRow、SectionDivider
//   controls/Select、Chip、IconButton
//   data/FilterNotice、EmptyState
//   本檔私有的帶狀組裝件在 internal.tsx
//
// 與 design 的差異：
//   1. variant 不搬。canvas 的五個 variant 是擺好的快照；app 內層級由
//      LevelSwitcher 切、順序由真的拖放改、資料來源濾掉全部主題單就走空狀態
//   2. 拖拉排序走瀏覽器原生 HTML5 drag and drop，跨區搬移（未排序拖進已排序）
//      與同區換序共用同一條路徑
//
// 尺寸：八週的排程視窗在桌面基準寬下放不完，板內橫向捲軸承接其餘天數；
// 左右兩欄同在捲動容器內，捲動時仍逐列對齊。

import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';

import { Chip, IconButton, Select } from '../../components/controls';
import { FilterNotice } from '../../components/data';
import { GanttHeader, LevelSwitcher, Toolbar } from '../../components/gantt';
import { FONT_FAMILY, NUMERIC_FONT_VARIANT, resolveGanttColors, TYPE_STYLES, useTheme } from '../../theme';
import { typeStyle } from '../typeStyle';
import {
  DEV_ORDER_CALENDAR_NAME,
  DEV_ORDER_DAYS,
  DEV_ORDER_DEFAULT_LEVEL,
  DEV_ORDER_DEFAULT_SOURCE,
  DEV_ORDER_INITIAL_SELECTED,
  DEV_ORDER_INITIAL_SORTED,
  DEV_ORDER_INITIAL_UNSORTED,
  DEV_ORDER_ISSUES,
  DEV_ORDER_LEVELS,
  DEV_ORDER_PERMISSION_FILTERED,
  DEV_ORDER_SOURCES,
  devOrderIssue,
  rangeLabel,
} from './fixtures';
import type { DevOrderLevelId, DevOrderSourceId } from './fixtures';
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

/** 拖放進行中的落點：要插進哪一區的第幾個位置。 */
interface DropTarget {
  readonly section: SectionId;
  readonly index: number;
}

export function DevOrderScreen() {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const days = DEV_ORDER_DAYS;
  const density = T.DENSITY;
  const listWidth = T.LIST_COLUMN_WIDTH;

  const [level, setLevel] = useState<DevOrderLevelId>(DEV_ORDER_DEFAULT_LEVEL);
  const [source, setSource] = useState<DevOrderSourceId>(DEV_ORDER_DEFAULT_SOURCE);
  const [selectedId, setSelectedId] = useState<string>(DEV_ORDER_INITIAL_SELECTED);

  // 順序狀態。兩區各存一份 id 序列，拖放就是在兩份序列之間搬 id。
  const [sortedIds, setSortedIds] = useState<readonly string[]>(DEV_ORDER_INITIAL_SORTED);
  const [unsortedIds, setUnsortedIds] = useState<readonly string[]>(DEV_ORDER_INITIAL_UNSORTED);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // 資料來源只決定哪些主題單看得到，不動順序狀態——換回來時順序還在。
  const visibleIds = useMemo(() => {
    if (source === 'all') return new Set(DEV_ORDER_ISSUES.map((issue) => issue.id));
    return new Set(
      DEV_ORDER_ISSUES.filter((issue) => issue.sources.includes(source)).map((issue) => issue.id),
    );
  }, [source]);

  const toRows = useCallback(
    (ids: readonly string[]): readonly DevOrderRow[] =>
      ids.flatMap((id) => {
        if (!visibleIds.has(id)) return [];
        const issue = devOrderIssue(id);
        if (issue === undefined) return [];
        return [{ issue, selected: id === selectedId, ghost: id === draggingId }];
      }),
    [visibleIds, selectedId, draggingId],
  );

  const sortedRows = useMemo(() => toRows(sortedIds), [toRows, sortedIds]);
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
      // preventDefault 才會觸發 drop；不擋預設的話瀏覽器一律視為不可放置。
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

  /**
   * 落地。先把 id 從原本那一區抽掉，再插進目標區的指定位置；
   * 同區往後搬時插入點要因為抽掉自己而前移一格，否則會落在預期的下一格。
   */
  const commitDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const id = draggingId;
      const target = dropTarget;
      endDrag();
      if (id === null || target === null) return;

      const from: SectionId = sortedIds.includes(id) ? 'sorted' : 'unsorted';
      const fromList = from === 'sorted' ? sortedIds : unsortedIds;
      const toList = target.section === 'sorted' ? sortedIds : unsortedIds;
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
    [draggingId, dropTarget, endDrag, sortedIds, unsortedIds],
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
      {/* 橫向捲動容器包住標頭與兩欄本體，三者共用同一個捲動偏移才不會錯位 */}
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
          {/* 未排序的主題單尚未排入順序，甘特側只留格線與假日底 */}
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
          <>
            <Select
              size="sm"
              prefix="資料來源"
              options={DEV_ORDER_SOURCES}
              value={source}
              onChange={(value) => setSource(value as DevOrderSourceId)}
            />
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
          </>
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
        {/* 權限過濾標示：count 為 0 時 FilterNotice 自行不渲染 */}
        <FilterNotice count={DEV_ORDER_PERMISSION_FILTERED} reason="無讀取權的專案" />
        {boardEmpty ? <DevOrderEmptyBoard /> : board}
      </div>
    </div>
  );
}
