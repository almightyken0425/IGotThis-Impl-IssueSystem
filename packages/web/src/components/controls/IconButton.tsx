// IconButton · 方形圖示鈕
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，IconButton 段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// 工具列的欄位顯示設定入口、表格 row 的行內動作用。
// 無 label，故一律帶 title 作 tooltip 與無障礙名稱。
// active 供 toggle 型入口用（面板展開中），視覺走 state.selected。

import { useState } from 'react';
import type { CSSProperties, MouseEventHandler } from 'react';

import { CONTROL_SHARED_TOKENS, ICON_BUTTON_TOKENS, controlFocusRing, useTheme } from '../../theme';
import type { ButtonVariant } from '../../theme';
import { ControlGlyph } from './ControlGlyph';
import type { ControlGlyphName } from './ControlGlyph';
import { useFocusVisible } from './useFocusVisible';

export type IconButtonSize = keyof typeof ICON_BUTTON_TOKENS.SIZE;

export interface IconButtonProps {
  readonly icon: ControlGlyphName;
  /** tooltip 與無障礙名稱，必填。 */
  readonly title: string;
  /** 省略即 ghost。色盤與 Button 共用。 */
  readonly variant?: ButtonVariant;
  readonly size?: IconButtonSize;
  /** toggle 型入口的展開中態。 */
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly style?: CSSProperties;
}

export function IconButton({
  icon,
  title,
  variant = 'ghost',
  size = 'md',
  active = false,
  disabled = false,
  onClick,
  style,
}: IconButtonProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const { focusVisible, focusProps } = useFocusVisible<HTMLButtonElement>();

  const colors = ICON_BUTTON_TOKENS.COLORS_BY_VARIANT(theme)[variant];
  const live = hover && !disabled;

  const fg = disabled
    ? theme.state.disabled.fg
    : active
      ? theme.state.selected.fg
      : live
        ? colors.fgHover
        : colors.fg;
  const bg = active ? theme.state.selected.bg : live ? colors.bgHover : colors.bg;
  const border = active
    ? theme.state.selected.border
    : disabled && colors.border !== 'transparent'
      ? theme.border.base
      : live
        ? colors.borderHover
        : colors.border;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...focusProps}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: ICON_BUTTON_TOKENS.SIZE[size],
        height: ICON_BUTTON_TOKENS.SIZE[size],
        padding: 0,
        borderRadius: ICON_BUTTON_TOKENS.RADIUS,
        border: `${ICON_BUTTON_TOKENS.BORDER_WIDTH}px solid ${border}`,
        background: bg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        boxShadow: focusVisible && !disabled ? controlFocusRing(theme) : 'none',
        transition: `background ${ICON_BUTTON_TOKENS.TRANSITION_MS}ms ${CONTROL_SHARED_TOKENS.TRANSITION_EASING}`,
        ...style,
      }}
    >
      <ControlGlyph name={icon} size={ICON_BUTTON_TOKENS.ICON[size]} color={fg} />
    </button>
  );
}
