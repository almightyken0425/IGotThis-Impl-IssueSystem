// Chip · 可移除的篩選標籤
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，Chip 段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// 工具列下方顯示已套用的篩選條件。
// onRemove 給了才出現移除鈕；不給就是純唯讀標籤。

import { useState } from 'react';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

import { CHIP_TOKENS, CONTROL_SHARED_TOKENS, FONT_FAMILY, RADIUS, controlFocusRing, useTheme } from '../../theme';
import { ControlGlyph } from './ControlGlyph';
import { textStyle } from './textStyle';
import { useFocusVisible } from './useFocusVisible';

export interface ChipProps {
  /** 欄位名前綴，如「Status」；渲染成「Status:」色階低一階。 */
  readonly label?: ReactNode;
  /** 條件值。 */
  readonly value: ReactNode;
  /** 進行中 / 被聚焦的條件，走 state.selected。 */
  readonly selected?: boolean;
  readonly onRemove?: () => void;
  readonly onClick?: MouseEventHandler<HTMLSpanElement>;
  readonly style?: CSSProperties;
}

export function Chip({ label, value, selected = false, onRemove, onClick, style }: ChipProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const [removeHover, setRemoveHover] = useState(false);
  const { focusVisible, focusProps } = useFocusVisible<HTMLSpanElement>();

  const colors = CHIP_TOKENS.COLORS(theme)[selected ? 'selected' : 'base'];
  const clickable = Boolean(onClick);

  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...focusProps}
      tabIndex={clickable ? 0 : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: CHIP_TOKENS.GAP,
        height: CHIP_TOKENS.HEIGHT,
        paddingLeft: CHIP_TOKENS.PADDING_LEFT,
        paddingRight: onRemove ? CHIP_TOKENS.PADDING_RIGHT_REMOVE : CHIP_TOKENS.PADDING_RIGHT,
        borderRadius: CHIP_TOKENS.RADIUS,
        border: `${CHIP_TOKENS.BORDER_WIDTH}px solid ${colors.border}`,
        background: hover && clickable ? colors.bgHover : colors.bg,
        color: colors.fg,
        fontFamily: FONT_FAMILY.base,
        ...textStyle(CHIP_TOKENS.TEXT),
        whiteSpace: 'nowrap',
        cursor: clickable ? 'pointer' : 'default',
        outline: 'none',
        boxShadow: focusVisible && clickable ? controlFocusRing(theme) : 'none',
        transition: `background ${CHIP_TOKENS.TRANSITION_MS}ms ${CONTROL_SHARED_TOKENS.TRANSITION_EASING}`,
        ...style,
      }}
    >
      {label && (
        <span style={{ ...textStyle(CHIP_TOKENS.LABEL_TEXT), color: colors.labelFg }}>{label}:</span>
      )}
      {value}
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          title="移除條件"
          aria-label="移除條件"
          onMouseEnter={() => setRemoveHover(true)}
          onMouseLeave={() => setRemoveHover(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: CHIP_TOKENS.REMOVE_HIT,
            height: CHIP_TOKENS.REMOVE_HIT,
            flexShrink: 0,
            padding: 0,
            borderRadius: RADIUS.full,
            border: 'none',
            background: removeHover ? colors.removeBgHover : 'transparent',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <ControlGlyph
            name="x"
            size={CHIP_TOKENS.REMOVE_ICON_SIZE}
            color={removeHover ? colors.removeFgHover : colors.removeFg}
            strokeWidth={CONTROL_SHARED_TOKENS.GLYPH_STROKE.bold}
          />
        </button>
      )}
    </span>
  );
}
