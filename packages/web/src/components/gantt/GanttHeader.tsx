// GanttHeader · 甘特標頭
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 與 design 端的唯一差異：theme 不再逐層傳 prop，改由 useTheme() 取當下主題；
// 元件名、props 名與語意逐字保留。
//
// 月份帶在上、日期刻度帶在下。leading 為左側 gutter 內容（畫面用來放日曆名稱），
// 寬度與主題單清單欄同值，讓標頭橫跨兩欄仍對齊。
// 日格窄到讀不出字時逐級降載：先收星期字母、再收日號，只留刻度線與假日底。

import type { CSSProperties, ReactNode } from 'react';

import type { Density } from '../../theme';
import {
  FONT_FAMILY,
  GANTT_TOKENS,
  NUMERIC_FONT_VARIANT,
  TYPE_STYLES,
  TYPOGRAPHY,
  resolveGanttColors,
  useTheme,
} from '../../theme';

import { ganttDensityOf, ganttMonthSegments, ganttType } from './internal';
import type { GanttDay } from './types';

export interface GanttHeaderProps {
  /** 橫軸日曆天，順序即畫面順序。 */
  readonly days: readonly GanttDay[];
  /** 左右兩欄必須同值才逐列對齊。 */
  readonly density?: Density;
  /** 左側 gutter 內容，畫面用來放日曆名稱。 */
  readonly leading?: ReactNode;
  /** gutter 寬度，與主題單清單欄同值。 */
  readonly leadingWidth?: number;
  readonly style?: CSSProperties;
}

export function GanttHeader({
  days,
  density = GANTT_TOKENS.DEFAULT_DENSITY,
  leading = null,
  leadingWidth = GANTT_TOKENS.LIST_COLUMN_WIDTH,
  style,
}: GanttHeaderProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const d = ganttDensityOf(density);
  const dayWidth = d.dayWidth;
  const segments = ganttMonthSegments(days);
  const showDayNumber = dayWidth >= GANTT_TOKENS.DAY_LABEL_MIN_CELL_WIDTH;
  const showWeekday = dayWidth >= GANTT_TOKENS.WEEKDAY_LABEL_MIN_CELL_WIDTH;

  return (
    <div
      style={{
        display: 'flex',
        background: colors.headerBg,
        borderBottom: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${colors.sectionLine}`,
        fontFamily: FONT_FAMILY.base,
        ...style,
      }}
    >
      {/* 左 gutter：日曆名稱等說明文字 */}
      <div
        style={{
          width: leadingWidth,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-end',
          padding: `0 ${GANTT_TOKENS.HEADER_LEADING_PADDING_H}px`,
          paddingBottom: GANTT_TOKENS.HEADER_LEADING_PADDING_BOTTOM,
          borderRight: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${colors.monthLine}`,
          ...ganttType(TYPE_STYLES.caption),
          color: colors.textSecondary,
        }}
      >
        {leading}
      </div>

      <div style={{ position: 'relative', width: days.length * dayWidth, flexShrink: 0 }}>
        {/* 月份帶 */}
        <div style={{ display: 'flex', height: GANTT_TOKENS.HEADER_MONTH_BAND_HEIGHT }}>
          {segments.map((segment, i) => (
            <div
              key={segment.label}
              style={{
                width: segment.span * dayWidth,
                display: 'flex',
                alignItems: 'center',
                padding: `0 ${GANTT_TOKENS.HEADER_MONTH_LABEL_PADDING_H}px`,
                borderLeft:
                  i === 0
                    ? 'none'
                    : `${GANTT_TOKENS.MONTH_SEPARATOR_WIDTH}px solid ${colors.monthLine}`,
                ...ganttType(TYPE_STYLES.label),
                color: colors.textPrimary,
                fontVariantNumeric: NUMERIC_FONT_VARIANT,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {segment.label}
            </div>
          ))}
        </div>

        {/* 日期刻度帶 */}
        <div
          style={{
            display: 'flex',
            height: GANTT_TOKENS.HEADER_DAY_BAND_HEIGHT,
            borderTop: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${colors.dayLine}`,
          }}
        >
          {days.map((day, i) => (
            <div
              key={day.key}
              style={{
                width: dayWidth,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0,
                background: day.isHoliday ? colors.holidayCell : 'transparent',
                borderLeft:
                  i === 0
                    ? 'none'
                    : `${
                        day.isMonthStart
                          ? GANTT_TOKENS.MONTH_SEPARATOR_WIDTH
                          : GANTT_TOKENS.GRID_LINE_WIDTH
                      }px solid ${
                        day.isMonthStart
                          ? colors.monthLine
                          : day.isWeekStart
                            ? colors.weekLine
                            : colors.dayLine
                      }`,
              }}
            >
              {showDayNumber && (
                <span
                  style={{
                    // 日號一律 secondary，假日不再降一階。降階版（tertiary）疊在
                    // 「header dim + 假日 tint」雙層底上只剩 4.10–4.54:1，落在 AA 之下，
                    // 且分數隨消費端墊什麼底浮動。假日的視覺區隔交給格底 tint 獨撐——
                    // 與本組「假日只用底色成塊」的定案一致。secondary 在同一底上 5.97–9.19。
                    ...ganttType(TYPE_STYLES.caption),
                    color: colors.textSecondary,
                    fontWeight: day.isToday
                      ? TYPOGRAPHY.weight.semibold
                      : TYPE_STYLES.caption.weight,
                    fontVariantNumeric: NUMERIC_FONT_VARIANT,
                  }}
                >
                  {day.dayNumber}
                </span>
              )}
              {showWeekday && (
                // 同日號一律 secondary。星期字母是整個標頭最小的字（2xs 10px），
                // 小字更需要對比而非更少——tertiary 疊在 dark 的假日底上只剩 4.20:1。
                // 日期帶內的層級改由字級承載：日號 11、星期字母 10，月份帶則走
                // textPrimary + label(12/medium)，三段仍有清楚階梯。
                <span
                  style={{
                    ...ganttType(TYPE_STYLES.caption),
                    fontSize: TYPOGRAPHY.size['2xs'],
                    color: colors.textSecondary,
                  }}
                >
                  {day.weekdayLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
