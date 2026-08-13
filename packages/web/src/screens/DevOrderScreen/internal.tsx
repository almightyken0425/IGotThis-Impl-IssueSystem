// DevOrderScreen · 私有 sub-section
//
// 來源：design git 的 `30_screens/no3_dev_order_screen/no2_subsections.jsx`
// 後半段。只服務 DevOrderScreen，不對其他畫面開放。
//
// 兩欄對齊的機制全部收在本檔的兩個帶狀元件：
//   DevOrderRowBand     一段連續的主題單列。左欄堆 SortableRow、右欄一座
//                       GanttTimeline，兩邊都只吃同一個 density，列高與列數同源
//   DevOrderSectionBand 區塊分隔帶。左欄 SectionDivider、右欄鏡射同高同邊線的
//                       填充帶，分隔本身也橫跨兩欄，不會把右欄的列往上推
//
// DevOrderDragRow 不搬：canvas 用它演出被抬起的那一列，app 走瀏覽器原生拖放，
// 拖曳影像由瀏覽器產生，自製浮起列會變成畫面上的第二列。原位殘影仍在——
// 由 SortableRow 的 ghost 承載。
//
// 拖放的命中判定在本檔：SortableRow 是受控視覺層，只吃 dropIndicator，
// 「游標落在哪兩列之間」由列容器的 onDragOver 依 bounding rect 中線算出。
//
// 未排序區不接受 drop：HTML5 原生拖放預設拒絕落點，只有 dragover 事件呼叫過
// preventDefault 的元素才會被瀏覽器允許 drop。DevOrderRowBand／DevOrderSectionBand
// 的 onDropIndexChange／onDrop 兩個 prop 因此是 optional——呼叫端（DevOrderScreen）
// 對未排序區直接不傳，本檔對應地讓 onDragOver 這個閉包本身在沒有 handler 時整個
// 不掛上 DOM（不是掛了但內部跳過），未排序列才會真的變成不合法落點，不是「掛著但
// 沒反應」。
//
// dragLocked 為真時整區列改 draggable={false}：避免上一筆拖曳寫回 API 還沒回來，
// 使用者又拖第二筆，兩次寫入互相踩到同一份依序遞增的 sortValue。

import type { DragEvent } from 'react';

import { EmptyState } from '../../components/data';
import { GanttBar, GanttTimeline, SectionDivider, SortableRow } from '../../components/gantt';
import type { Density, GanttDay } from '../../components/gantt';
import {
  FONT_FAMILY,
  GANTT_TOKENS,
  resolveGanttColors,
  TYPE_STYLES,
  useTheme,
} from '../../theme';
import { typeStyle } from '../typeStyle';
import { DEV_ORDER_LEVEL_DEPTH, durationLabel } from './fixtures';
import type { DevOrderIssue, DevOrderLevelId } from './fixtures';
import { DEV_ORDER_SCREEN_TOKENS } from './tokens';

const T = DEV_ORDER_SCREEN_TOKENS;

// ─── 標頭左 gutter ───────────────────────────────────────────
// GanttHeader 的 leading 內容。寬度與主題單清單欄同值，標頭才橫跨兩欄仍對齊。

export function DevOrderHeaderLeading({ calendarName }: { readonly calendarName: string }) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: T.HEADER_LEADING_GAP, minWidth: 0 }}
    >
      <span
        style={{
          ...typeStyle(TYPE_STYLES.overline),
          color: colors.textSecondary,
          whiteSpace: 'nowrap',
        }}
      >
        主題單
      </span>
      <span
        style={{
          ...typeStyle(TYPE_STYLES.caption),
          color: colors.textTertiary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {`天數依 ${calendarName}`}
      </span>
    </div>
  );
}

// ─── 區塊分隔帶 ──────────────────────────────────────────────
// 左欄放 SectionDivider，右欄鏡射一條同高同邊線的填充帶。兩側都吃
// GANTT_TOKENS.SECTION_DIVIDER_HEIGHT 與同一組邊線色，分隔才真的橫跨兩欄。
// 本帶同時是「插到這一區最前面」的落點。

export interface DevOrderSectionBandProps {
  readonly days: readonly GanttDay[];
  readonly density: Density;
  readonly listWidth: number;
  readonly title: string;
  readonly count: number;
  readonly hint?: string | undefined;
  readonly active?: boolean;
  readonly onDragOver?: ((event: DragEvent<HTMLElement>) => void) | undefined;
  readonly onDrop?: ((event: DragEvent<HTMLElement>) => void) | undefined;
}

export function DevOrderSectionBand({
  days,
  density,
  listWidth,
  title,
  count,
  hint,
  active = false,
  onDragOver,
  onDrop,
}: DevOrderSectionBandProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const dayWidth = GANTT_TOKENS.DENSITY[density].dayWidth;
  const line = active ? colors.dropIndicator : colors.sectionLine;

  return (
    <div
      style={{ display: 'flex', alignItems: 'stretch' }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        style={{
          width: listWidth,
          flexShrink: 0,
          borderRight: `${GANTT_TOKENS.MONTH_SEPARATOR_WIDTH}px solid ${colors.monthLine}`,
        }}
      >
        <SectionDivider title={title} count={count} hint={hint} active={active} />
      </div>
      <div
        aria-hidden="true"
        style={{
          width: days.length * dayWidth,
          flexShrink: 0,
          boxSizing: 'border-box',
          height: GANTT_TOKENS.SECTION_DIVIDER_HEIGHT,
          background: colors.sectionBg,
          borderTop: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${line}`,
          borderBottom: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${line}`,
          transition: `border-color ${GANTT_TOKENS.ROW_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}`,
        }}
      />
    </div>
  );
}

// ─── 主題單列帶 ──────────────────────────────────────────────
// 一段連續的列。左欄一列一顆 SortableRow、右欄一座 GanttTimeline 承 rows 列，
// 兩邊只傳 density、不各自指定 rowHeight，列高同源。
//
// showBars 為假時右欄只留格線與假日底（未排序區的列不排程，照 spec 線框圖留白）。

export interface DevOrderRow {
  readonly issue: DevOrderIssue;
  readonly selected: boolean;
  readonly ghost: boolean;
  /** 這筆的排序寫入正在等後端確認。借用 SortableRow 的 disabled 視覺呈現。 */
  readonly pending: boolean;
}

export interface DevOrderRowBandProps {
  readonly days: readonly GanttDay[];
  readonly density: Density;
  readonly listWidth: number;
  readonly rows: readonly DevOrderRow[];
  readonly levelId: DevOrderLevelId;
  readonly showBars?: boolean;
  /** 插入點落在本區第幾列之前；等於 rows.length 表示插在末列之後。 */
  readonly dropIndex?: number | undefined;
  /** 為真時整區列 draggable=false，鎖住新拖曳直到目前寫入完成。 */
  readonly dragLocked?: boolean | undefined;
  readonly onSelect: (id: string) => void;
  readonly onDragStart: (id: string, event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
  /**
   * 游標落在兩列之間時回報插入點。由本元件依 bounding rect 中線算出。
   * 省略即本區不接受 drop（未排序區的既定用法）。
   */
  readonly onDropIndexChange?: ((index: number, event: DragEvent<HTMLElement>) => void) | undefined;
  readonly onDrop?: ((event: DragEvent<HTMLElement>) => void) | undefined;
}

export function DevOrderRowBand({
  days,
  density,
  listWidth,
  rows,
  levelId,
  showBars = true,
  dropIndex,
  dragLocked = false,
  onSelect,
  onDragStart,
  onDragEnd,
  onDropIndexChange,
  onDrop,
}: DevOrderRowBandProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const depth = DEV_ORDER_LEVEL_DEPTH[levelId];

  const barsOf = (row: DevOrderRow, rowIndex: number) => {
    const bars = row.issue.levels[levelId];
    // 該層級無內容 → 空列。
    if (bars === null) {
      return <GanttBar key={`${row.issue.id}-empty`} days={days} density={density} rowIndex={rowIndex} empty />;
    }
    // 有內容但缺 StartTime 或 EndTime → 不畫長條，列留白。
    return bars.map((bar, i) => (
      <GanttBar
        key={`${row.issue.id}-${i}`}
        days={days}
        density={density}
        rowIndex={rowIndex}
        level={depth}
        startIndex={bar.start}
        span={bar.span}
        durationLabel={durationLabel(days, bar)}
        selected={row.selected}
        onActivate={() => onSelect(row.issue.id)}
      />
    ));
  };

  // 插入點畫在哪一列上：落在第 i 列之前就標該列上緣；落在末列之後改標末列下緣。
  const indicatorOf = (index: number) => {
    if (dropIndex === undefined) return 'none' as const;
    if (dropIndex === index) return 'above' as const;
    if (dropIndex === rows.length && index === rows.length - 1) return 'below' as const;
    return 'none' as const;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div
        style={{
          position: 'relative',
          width: listWidth,
          flexShrink: 0,
          borderRight: `${GANTT_TOKENS.MONTH_SEPARATOR_WIDTH}px solid ${colors.monthLine}`,
        }}
      >
        {rows.map((row, index) => (
          <div
            key={row.issue.id}
            draggable={!dragLocked}
            onDragStart={(event) => onDragStart(row.issue.id, event)}
            onDragEnd={onDragEnd}
            onDragOver={
              onDropIndexChange === undefined
                ? undefined
                : (event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const after = event.clientY > rect.top + rect.height / 2;
                    onDropIndexChange(after ? index + 1 : index, event);
                  }
            }
            onDrop={onDrop}
          >
            <SortableRow
              density={density}
              title={row.issue.title}
              meta={row.issue.key}
              selected={row.selected}
              ghost={row.ghost}
              disabled={row.pending}
              dropIndicator={indicatorOf(index)}
              onActivate={() => onSelect(row.issue.id)}
            />
          </div>
        ))}
      </div>
      <GanttTimeline days={days} rows={rows.length} density={density}>
        {showBars ? rows.map((row, i) => barsOf(row, i)) : null}
      </GanttTimeline>
    </div>
  );
}

// ─── 板底圖例 ────────────────────────────────────────────────
// 假日格、工期單位與所用日曆、空列三件事在此一次講清楚。
// 工期數字擠不下「單位 + 日曆」，故長條內只放數字，日曆歸屬由本列統一標明。

export function DevOrderLegend({ calendarName }: { readonly calendarName: string }) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);

  const item = (mark: React.ReactNode, text: string) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: T.LEGEND_ITEM_GAP,
        whiteSpace: 'nowrap',
      }}
    >
      {mark}
      {text}
    </span>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: T.LEGEND_GAP,
        minHeight: T.LEGEND_MIN_HEIGHT,
        padding: `0 ${T.LEGEND_PADDING_H}px`,
        background: colors.headerBg,
        borderTop: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${colors.sectionLine}`,
        ...typeStyle(TYPE_STYLES.caption),
        color: colors.textTertiary,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      {item(
        <span
          style={{
            width: T.LEGEND_SWATCH_WIDTH,
            height: T.LEGEND_SWATCH_HEIGHT,
            background: colors.holidayCell,
            border: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${colors.dayLine}`,
            borderRadius: T.LEGEND_SWATCH_RADIUS,
            flexShrink: 0,
          }}
        />,
        `假日格 · ${calendarName}`,
      )}
      {item(
        <span
          style={{
            width: T.LEGEND_SWATCH_WIDTH,
            height: T.LEGEND_BAR_HEIGHT,
            background: colors.barFill,
            borderRadius: GANTT_TOKENS.BAR_RADIUS,
            flexShrink: 0,
          }}
        />,
        `工單長條，數字為工期天數，依 ${calendarName} 扣除假日`,
      )}
      {item(
        <span
          style={{
            width: T.LEGEND_RULE_WIDTH,
            flexShrink: 0,
            borderTop: `${GANTT_TOKENS.EMPTY_ROW_RULE_WIDTH}px dashed ${colors.emptyRowRule}`,
          }}
        />,
        '虛線列：該主題單尚未拆到目前層級',
      )}
    </div>
  );
}

// ─── 空狀態板 ────────────────────────────────────────────────
// 檢視內沒有任何主題單時，整塊雙欄板換成空狀態。

export function DevOrderEmptyBoard() {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: T.EMPTY_MIN_HEIGHT,
        border: `${T.BOARD_BORDER_WIDTH}px solid ${colors.controlBorder}`,
        borderRadius: T.BOARD_RADIUS,
        background: colors.rowBg,
      }}
    >
      <EmptyState
        title="此檢視沒有主題單"
        description="換一個資料來源，或先在清單畫面建立主題單。"
        action={{ label: '新增主題單', icon: 'plus' }}
      />
    </div>
  );
}
