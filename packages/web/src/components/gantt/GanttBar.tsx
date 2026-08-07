// GanttBar · 工單長條
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 與 design 端的唯一差異：theme 不再逐層傳 prop，改由 useTheme() 取當下主題。
//
// 一列一顆。startIndex / span 對應 StartTime 與 EndTime 落在 days 上的索引與天數。
//
// 層級縮排的取法：水平起訖絕不動，動了日期就對不上刻度。改用兩件事表達深度——
// 長條每深一層薄一階（BAR_LEVEL_HEIGHT_STEP），工期標籤在長條內左縮一階（BAR_LEVEL_INDENT）。
//
// 超期偏離：overrunSpan > 0 時在主段尾端接一截 error 斜紋段，並掛 +N 標。
// 空列：empty 為真時不畫長條，改畫虛線與「尚未拆到該層深度」提示。
// 缺 StartTime 或 EndTime 由畫面端判斷後不渲染本元件，元件本身不猜。

import { useState } from 'react';
import type { CSSProperties } from 'react';

import type { Density } from '../../theme';
import {
  GANTT_TOKENS,
  NUMERIC_FONT_VARIANT,
  TYPE_STYLES,
  TYPOGRAPHY,
  resolveGanttColors,
  useTheme,
} from '../../theme';

import { ganttDensityOf, ganttFocusStyle, ganttShadow, ganttType } from './internal';
import type { GanttDay } from './types';

export interface GanttBarProps {
  /** 橫軸日曆天。只用來量空列的滿寬，長條本身走 startIndex / span。 */
  readonly days?: readonly GanttDay[];
  /** StartTime 落在 days 上的索引。 */
  readonly startIndex?: number;
  /** 工期天數。 */
  readonly span?: number;
  /** 超期天數。大於 0 才畫斜紋段與 +N 標。 */
  readonly overrunSpan?: number;
  /** 本列在 timeline 內的列序，決定絕對定位的 top。 */
  readonly rowIndex?: number;
  /** 階層深度。每深一層長條薄一階、標籤左縮一階。 */
  readonly level?: number;
  /** 工期文字。夠寬放長條內，太窄改掛尾端外側。 */
  readonly durationLabel?: string;
  /** 左右兩欄必須同值才逐列對齊。 */
  readonly density?: Density;
  /** 覆寫列高。省略即取 density 的列高。 */
  readonly rowHeight?: number;
  /** 該列在當前顯示層級下沒有工單。 */
  readonly empty?: boolean;
  readonly emptyLabel?: string;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  /** 給了才成為可點的 button，否則是純圖形。 */
  readonly onActivate?: () => void;
  readonly style?: CSSProperties;
}

export function GanttBar({
  days,
  startIndex = 0,
  span = 1,
  overrunSpan = 0,
  rowIndex = 0,
  level = 0,
  durationLabel,
  density = GANTT_TOKENS.DEFAULT_DENSITY,
  rowHeight,
  empty = false,
  emptyLabel = '尚未拆到該層深度',
  disabled = false,
  selected = false,
  onActivate,
  style,
}: GanttBarProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const d = ganttDensityOf(density);
  const dayWidth = d.dayWidth;
  const rh = rowHeight ?? d.rowHeight;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const top = rowIndex * rh;

  if (empty) {
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          top,
          height: rh,
          width: (days ? days.length : span) * dayWidth,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${GANTT_TOKENS.EMPTY_ROW_PADDING_H}px`,
          gap: GANTT_TOKENS.ROW_GAP,
          pointerEvents: 'none',
          ...style,
        }}
      >
        <span
          style={{
            ...ganttType(TYPE_STYLES.caption),
            color: colors.textTertiary,
            whiteSpace: 'nowrap',
          }}
        >
          {emptyLabel}
        </span>
        <span
          style={{
            flex: 1,
            borderTop: `${GANTT_TOKENS.EMPTY_ROW_RULE_WIDTH}px dashed ${colors.emptyRowRule}`,
          }}
        />
      </div>
    );
  }

  const barHeight = Math.max(
    d.barHeight - level * GANTT_TOKENS.BAR_LEVEL_HEIGHT_STEP,
    GANTT_TOKENS.BAR_HEIGHT_MIN,
  );
  const left = startIndex * dayWidth + GANTT_TOKENS.BAR_INSET_H;
  const mainWidth = Math.max(
    span * dayWidth - GANTT_TOKENS.BAR_INSET_H * 2,
    GANTT_TOKENS.BAR_MIN_WIDTH,
  );
  const overrunWidth =
    overrunSpan > 0 ? Math.max(overrunSpan * dayWidth, GANTT_TOKENS.OVERRUN_MIN_WIDTH) : 0;
  const totalWidth = mainWidth + overrunWidth;
  const labelInside = mainWidth >= GANTT_TOKENS.BAR_LABEL_INSIDE_MIN_WIDTH;
  const stripe = GANTT_TOKENS.OVERRUN_STRIPE_WIDTH;

  return (
    <div
      role={onActivate ? 'button' : 'img'}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={durationLabel}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => !disabled && setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={() => {
        if (!disabled) onActivate?.();
      }}
      style={{
        position: 'absolute',
        left,
        top: top + (rh - barHeight) / 2,
        height: barHeight,
        display: 'flex',
        alignItems: 'stretch',
        cursor: disabled ? 'default' : onActivate ? 'pointer' : 'default',
        opacity: disabled ? colors.disabledOpacity : 1,
        borderRadius: GANTT_TOKENS.BAR_RADIUS,
        boxShadow:
          hovered && !disabled ? ganttShadow(theme, GANTT_TOKENS.BAR_HOVER_ELEVATION) : 'none',
        transition: `box-shadow ${GANTT_TOKENS.BAR_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}, background ${GANTT_TOKENS.BAR_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}`,
        ...ganttFocusStyle(colors, focused && !disabled),
        ...style,
      }}
    >
      {/* 主段 */}
      <div
        style={{
          width: mainWidth,
          background: hovered && !disabled ? colors.barFillHover : colors.barFill,
          borderRadius: overrunWidth
            ? `${GANTT_TOKENS.BAR_RADIUS}px 0 0 ${GANTT_TOKENS.BAR_RADIUS}px`
            : GANTT_TOKENS.BAR_RADIUS,
          border: selected
            ? `${GANTT_TOKENS.BAR_SELECTED_BORDER_WIDTH}px solid ${colors.barBorder}`
            : 'none',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: GANTT_TOKENS.BAR_LABEL_PADDING_H + level * GANTT_TOKENS.BAR_LEVEL_INDENT,
          paddingRight: GANTT_TOKENS.BAR_LABEL_PADDING_H,
          overflow: 'hidden',
        }}
      >
        {labelInside && durationLabel !== undefined && (
          <span
            style={{
              ...ganttType(TYPE_STYLES.caption),
              color: colors.barLabelOn,
              fontVariantNumeric: NUMERIC_FONT_VARIANT,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {durationLabel}
          </span>
        )}
      </div>

      {/* 超期偏離段 */}
      {overrunWidth > 0 && (
        <div
          style={{
            width: overrunWidth,
            borderRadius: `0 ${GANTT_TOKENS.BAR_RADIUS}px ${GANTT_TOKENS.BAR_RADIUS}px 0`,
            background: `repeating-linear-gradient(${GANTT_TOKENS.OVERRUN_STRIPE_ANGLE}, ${colors.overrun} 0 ${stripe}px, ${colors.overrunTrack} ${stripe}px ${stripe * 2}px)`,
          }}
        />
      )}

      {/* 外掛標籤：長條太窄放不下工期字時，或需要標超期天數時 */}
      {(!labelInside || overrunSpan > 0) && (
        <span
          style={{
            position: 'absolute',
            left: totalWidth + GANTT_TOKENS.OVERRUN_LABEL_GAP,
            top: 0,
            height: barHeight,
            display: 'flex',
            alignItems: 'center',
            gap: GANTT_TOKENS.OVERRUN_LABEL_GAP,
            ...ganttType(TYPE_STYLES.caption),
            color: colors.barLabelOutside,
            fontVariantNumeric: NUMERIC_FONT_VARIANT,
            whiteSpace: 'nowrap',
          }}
        >
          {!labelInside && durationLabel}
          {overrunSpan > 0 && (
            <span style={{ color: colors.overrunLabel, fontWeight: TYPOGRAPHY.weight.medium }}>
              {`超期 +${overrunSpan}`}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
