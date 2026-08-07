// SortableRow · 可拖拉的主題單列
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 與 design 端的唯一差異：theme 不再逐層傳 prop，改由 useTheme() 取當下主題。
//
// 主題單列。列高與同 density 的甘特列一致，兩欄才對得齊。
// 狀態：預設 / hover / focus / dragging（拖起本體）/ ghost（原位殘影）/ selected / disabled。
// dropIndicator 取 'none' | 'above' | 'below'，線首帶圓頭指出插入點。
//
// 拖曳互動的分工：本元件是純受控的視覺層，自己不記錄拖曳狀態、不做命中判定、
// 不接任何拖放函式庫。畫面層拿三個接縫驅動它——
//   1. onHandlePointerDown  把手上的指標按下事件，拖曳序列由畫面層自此起手
//   2. dragging / ghost / dropIndicator  三個布林與位置旗標，由畫面層算完餵回來
//   3. style  最後展開、蓋得過內建樣式，拖曳中的 transform 由畫面層從此處灌入
// 之後接 dnd 函式庫時只換畫面層，本檔的 props 介面不動。

import { useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { Density, GanttColors } from '../../theme';
import {
  FONT_FAMILY,
  GANTT_TOKENS,
  NUMERIC_FONT_VARIANT,
  TYPE_STYLES,
  resolveGanttColors,
  useTheme,
} from '../../theme';

import { ganttDensityOf, ganttFocusStyle, ganttShadow, ganttType } from './internal';
import type { DropIndicatorPosition } from './types';

/** 拖曳把手的六點 grip。design 端註明是 canvas 自製 SVG，impl 尚無 icon 系統，原樣搬入。 */
function GanttGrip({ size, color }: { readonly size: number; readonly color: string }) {
  const dots = [
    [5, 4],
    [11, 4],
    [5, 8],
    [11, 8],
    [5, 12],
    [11, 12],
  ] as const;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" fill={color} />
      ))}
    </svg>
  );
}

export interface SortableRowProps {
  /** 主題單標題。 */
  readonly title: ReactNode;
  /** 次要資訊，如工單編號、計數。 */
  readonly meta?: ReactNode;
  /** 左右兩欄必須同值才逐列對齊。 */
  readonly density?: Density;
  /** 覆寫列高。省略即取 density 的列高。 */
  readonly rowHeight?: number;
  /** 本列正被拖起：提亮、放大、投影。 */
  readonly dragging?: boolean;
  /** 本列是拖起後留在原位的殘影。 */
  readonly ghost?: boolean;
  /** 放置指示線的位置。 */
  readonly dropIndicator?: DropIndicatorPosition;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  /** 把手上的指標按下。畫面層在此起手拖曳序列。 */
  readonly onHandlePointerDown?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  readonly onActivate?: () => void;
  readonly style?: CSSProperties;
}

export function SortableRow({
  title,
  meta,
  density = GANTT_TOKENS.DEFAULT_DENSITY,
  rowHeight,
  dragging = false,
  ghost = false,
  dropIndicator = 'none',
  selected = false,
  disabled = false,
  onHandlePointerDown,
  onActivate,
  style,
}: SortableRowProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const d = ganttDensityOf(density);
  const rh = rowHeight ?? d.rowHeight;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [handleHovered, setHandleHovered] = useState(false);

  const background = disabled
    ? colors.rowBg
    : selected
      ? colors.rowBgSelected
      : hovered || dragging
        ? colors.rowBgHover
        : colors.rowBg;

  return (
    <div
      role="listitem"
      aria-grabbed={dragging || undefined}
      aria-disabled={disabled || undefined}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => !disabled && setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={() => {
        if (!disabled) onActivate?.();
      }}
      tabIndex={disabled ? -1 : 0}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: GANTT_TOKENS.ROW_GAP,
        height: rh,
        padding: `0 ${GANTT_TOKENS.ROW_PADDING_H}px`,
        background,
        borderBottom: `${GANTT_TOKENS.ROW_LINE_WIDTH}px solid ${colors.rowLine}`,
        borderRadius: dragging ? GANTT_TOKENS.DRAG_ROW_RADIUS : 0,
        boxShadow: dragging ? ganttShadow(theme, GANTT_TOKENS.DRAG_ROW_ELEVATION) : 'none',
        transform: dragging ? `scale(${GANTT_TOKENS.DRAG_ROW_SCALE})` : 'none',
        opacity: ghost ? GANTT_TOKENS.DRAG_GHOST_OPACITY : 1,
        cursor: disabled ? 'default' : onActivate ? 'pointer' : 'default',
        fontFamily: FONT_FAMILY.base,
        transition: `background ${GANTT_TOKENS.ROW_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}, box-shadow ${GANTT_TOKENS.ROW_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}, transform ${GANTT_TOKENS.ROW_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}`,
        ...ganttFocusStyle(colors, focused && !disabled),
        ...style,
      }}
    >
      {/* 拖曳把手 */}
      <span
        role="button"
        aria-label="拖曳排序"
        tabIndex={disabled ? -1 : 0}
        onPointerDown={disabled ? undefined : onHandlePointerDown}
        onMouseEnter={() => !disabled && setHandleHovered(true)}
        onMouseLeave={() => setHandleHovered(false)}
        style={{
          width: GANTT_TOKENS.DRAG_HANDLE_WIDTH,
          height: GANTT_TOKENS.DRAG_HANDLE_WIDTH,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: GANTT_TOKENS.DRAG_HANDLE_RADIUS,
          cursor: disabled ? 'not-allowed' : dragging ? 'grabbing' : 'grab',
          opacity: disabled ? colors.disabledOpacity : 1,
        }}
      >
        <GanttGrip
          size={GANTT_TOKENS.DRAG_HANDLE_ICON_SIZE}
          color={
            disabled
              ? colors.textDisabled
              : handleHovered || dragging
                ? colors.handleActive
                : colors.handle
          }
        />
      </span>

      {/* 標題 */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          ...ganttType(TYPE_STYLES.tableCell),
          color: disabled
            ? colors.textDisabled
            : selected
              ? colors.textSelected
              : colors.textPrimary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </span>

      {/* 次要資訊（工單編號、計數等）*/}
      {meta !== undefined && meta !== null && (
        <span
          style={{
            flexShrink: 0,
            ...ganttType(TYPE_STYLES.caption),
            color: disabled ? colors.textDisabled : colors.textTertiary,
            fontVariantNumeric: NUMERIC_FONT_VARIANT,
          }}
        >
          {meta}
        </span>
      )}

      {dropIndicator !== 'none' && <DropIndicator position={dropIndicator} colors={colors} />}
    </div>
  );
}

/** 放置指示線。線身走 pill，線首掛圓頭指出插入點。 */
function DropIndicator({
  position,
  colors,
}: {
  readonly position: Exclude<DropIndicatorPosition, 'none'>;
  readonly colors: GanttColors;
}) {
  const edge: CSSProperties =
    position === 'above'
      ? { top: -GANTT_TOKENS.DROP_INDICATOR_WIDTH / 2 }
      : { bottom: -GANTT_TOKENS.DROP_INDICATOR_WIDTH / 2 };

  return (
    <div
      style={{
        position: 'absolute',
        left: GANTT_TOKENS.DROP_INDICATOR_INSET,
        right: GANTT_TOKENS.DROP_INDICATOR_INSET,
        ...edge,
        height: GANTT_TOKENS.DROP_INDICATOR_WIDTH,
        background: colors.dropIndicator,
        borderRadius: GANTT_TOKENS.DROP_INDICATOR_RADIUS,
        pointerEvents: 'none',
        transition: `opacity ${GANTT_TOKENS.DROP_INDICATOR_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -GANTT_TOKENS.DROP_INDICATOR_CAP_SIZE / 2,
          top: (GANTT_TOKENS.DROP_INDICATOR_WIDTH - GANTT_TOKENS.DROP_INDICATOR_CAP_SIZE) / 2,
          width: GANTT_TOKENS.DROP_INDICATOR_CAP_SIZE,
          height: GANTT_TOKENS.DROP_INDICATOR_CAP_SIZE,
          borderRadius: GANTT_TOKENS.DROP_INDICATOR_RADIUS,
          background: colors.dropIndicator,
        }}
      />
    </div>
  );
}
