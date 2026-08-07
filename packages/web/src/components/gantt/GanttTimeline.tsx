// GanttTimeline · 時間軸背景
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 與 design 端的唯一差異：theme 不再逐層傳 prop，改由 useTheme() 取當下主題。
//
// 只畫背景：假日格底、日 / 週 / 月三級縱線、列分隔橫線。
// 假日視覺在此定案——只用底色成塊，不加邊框、不加斜紋，讓長條與偏離斜紋獨佔圖樣語彙。
// children 疊在背景之上，由畫面丟入逐列的 GanttBar。

import type { CSSProperties, ReactNode } from 'react';

import type { Density } from '../../theme';
import { FONT_FAMILY, GANTT_TOKENS, resolveGanttColors, useTheme } from '../../theme';

import { ganttDensityOf } from './internal';
import type { GanttDay } from './types';

export interface GanttTimelineProps {
  /** 橫軸日曆天，與 GanttHeader 吃同一份才對得上刻度。 */
  readonly days: readonly GanttDay[];
  /** 列數，決定橫線條數與最小高度。 */
  readonly rows?: number;
  /** 左右兩欄必須同值才逐列對齊。 */
  readonly density?: Density;
  /** 覆寫列高。省略即取 density 的列高。 */
  readonly rowHeight?: number;
  /** 逐列的 GanttBar，疊在背景之上。 */
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}

export function GanttTimeline({
  days,
  rows = 1,
  density = GANTT_TOKENS.DEFAULT_DENSITY,
  rowHeight,
  children,
  style,
}: GanttTimelineProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const d = ganttDensityOf(density);
  const dayWidth = d.dayWidth;
  const rh = rowHeight ?? d.rowHeight;
  const width = days.length * dayWidth;
  const height = rows * rh;

  return (
    <div
      style={{
        position: 'relative',
        width,
        minHeight: height,
        background: colors.timelineBg,
        fontFamily: FONT_FAMILY.base,
        ...style,
      }}
    >
      {/* 假日格底 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {days.map((day, i) =>
          day.isHoliday === true ? (
            <div
              key={day.key}
              style={{
                position: 'absolute',
                left: i * dayWidth,
                top: 0,
                bottom: 0,
                width: dayWidth,
                background: colors.holidayCell,
              }}
            />
          ) : null,
        )}
      </div>

      {/* 縱線：月 > 週 > 日 三級 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {days.map((day, i) =>
          i === 0 ? null : (
            <div
              key={day.key}
              style={{
                position: 'absolute',
                left: i * dayWidth,
                top: 0,
                bottom: 0,
                width: day.isMonthStart
                  ? GANTT_TOKENS.MONTH_SEPARATOR_WIDTH
                  : GANTT_TOKENS.GRID_LINE_WIDTH,
                background: day.isMonthStart
                  ? colors.monthLine
                  : day.isWeekStart
                    ? colors.weekLine
                    : colors.dayLine,
              }}
            />
          ),
        )}
      </div>

      {/* 橫線：與左欄列高同步 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: (r + 1) * rh - GANTT_TOKENS.ROW_LINE_WIDTH,
              height: GANTT_TOKENS.ROW_LINE_WIDTH,
              background: colors.rowLine,
            }}
          />
        ))}
      </div>

      <div style={{ position: 'relative', width, minHeight: height }}>{children}</div>
    </div>
  );
}
