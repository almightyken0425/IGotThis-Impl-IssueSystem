// LevelSwitcher · 顯示層級切換器
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 與 design 端的唯一差異：theme 不再逐層傳 prop，改由 useTheme() 取當下主題。
//
// 形式定案為分段控制（segmented control）。
// 選定理由：層級是少數且固定的有序集合，切換頻繁且要能一眼看出「現在在哪一層、
// 還有哪幾層」。下拉選單會把兄弟層藏起來、每次切換多一次點擊；分段控制把整條
// 層級軸攤平在工具列上，一次點擊直達，也順帶當作深度的視覺尺規。
// 層級多到攤不下時改走 overflow，由畫面端決定，元件不自作主張。

import { useState } from 'react';
import type { CSSProperties } from 'react';

import {
  FONT_FAMILY,
  GANTT_TOKENS,
  TYPE_STYLES,
  resolveGanttColors,
  useTheme,
} from '../../theme';

import { ganttFocusStyle, ganttType } from './internal';
import type { LevelOption } from './types';

export interface LevelSwitcherProps {
  /** 層級軸，順序即由淺到深。 */
  readonly levels?: readonly LevelOption[];
  /** 當前層級的 id。 */
  readonly value?: string;
  readonly onChange?: (id: string) => void;
  /** 整組停用。個別段停用走 LevelOption.disabled。 */
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly style?: CSSProperties;
}

export function LevelSwitcher({
  levels = [],
  value,
  onChange,
  disabled = false,
  ariaLabel = '顯示層級',
  style,
}: LevelSwitcherProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: GANTT_TOKENS.LEVEL_SWITCHER_PADDING,
        height: GANTT_TOKENS.LEVEL_SWITCHER_HEIGHT,
        padding: GANTT_TOKENS.LEVEL_SWITCHER_PADDING,
        borderRadius: GANTT_TOKENS.LEVEL_SWITCHER_RADIUS,
        border: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${colors.controlBorder}`,
        background: colors.headerBg,
        opacity: disabled ? colors.disabledOpacity : 1,
        fontFamily: FONT_FAMILY.base,
        ...style,
      }}
    >
      {levels.map((level) => {
        const isSelected = level.id === value;
        const isDisabled = disabled || level.disabled === true;
        const isHovered = hoveredId === level.id && !isDisabled;
        return (
          <button
            key={level.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            onMouseEnter={() => setHoveredId(level.id)}
            onMouseLeave={() => setHoveredId(null)}
            onFocus={() => setFocusedId(level.id)}
            onBlur={() => setFocusedId(null)}
            onClick={() => {
              if (!isDisabled) onChange?.(level.id);
            }}
            style={{
              height:
                GANTT_TOKENS.LEVEL_SWITCHER_HEIGHT - GANTT_TOKENS.LEVEL_SWITCHER_PADDING * 2,
              minWidth: GANTT_TOKENS.LEVEL_SWITCHER_ITEM_MIN_WIDTH,
              padding: `0 ${GANTT_TOKENS.LEVEL_SWITCHER_ITEM_PADDING_H}px`,
              border: 'none',
              borderRadius: GANTT_TOKENS.LEVEL_SWITCHER_ITEM_RADIUS,
              background: isSelected
                ? colors.rowBgSelected
                : isHovered
                  ? colors.rowBgHover
                  : 'transparent',
              ...ganttType(TYPE_STYLES.label),
              color: isDisabled
                ? colors.textDisabled
                : isSelected
                  ? colors.textSelected
                  : colors.textSecondary,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: `background ${GANTT_TOKENS.SWITCHER_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}, color ${GANTT_TOKENS.SWITCHER_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}`,
              ...ganttFocusStyle(colors, focusedId === level.id && !isDisabled),
            }}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
