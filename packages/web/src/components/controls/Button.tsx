// Button · 文字動作鈕
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，Button 與 ControlSpinner 兩段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 一切視覺值走 BUTTON_TOKENS 與當下 theme，本檔無 hex、無 raw number。
//
// disabled 依 variant 分流：實心降 opacity、有框退框、無框只換字色。

import { useInsertionEffect, useState } from 'react';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

import {
  BUTTON_TOKENS,
  CONTROL_SHARED_TOKENS,
  FONT_FAMILY,
  RADIUS,
  controlFocusRing,
  useTheme,
} from '../../theme';
import type { ButtonVariant } from '../../theme';
import { ControlGlyph } from './ControlGlyph';
import type { ControlGlyphName } from './ControlGlyph';
import { textStyle } from './textStyle';
import { useFocusVisible } from './useFocusVisible';

export type ButtonSize = keyof typeof BUTTON_TOKENS.HEIGHT;

// ─── loading spinner 的 keyframes ────────────────────────────
// inline style 表達不了 keyframes，首次用到時注入一次；id 去重避免重複堆疊。
// useInsertionEffect 在 layout 之前跑，動畫第一幀就吃得到規則。

const SPIN_KEYFRAMES_ID = 'igt-control-keyframes';
const SPIN_ANIMATION_NAME = 'igt-spin';

function useSpinKeyframes(): void {
  useInsertionEffect(() => {
    if (document.getElementById(SPIN_KEYFRAMES_ID)) return;
    const el = document.createElement('style');
    el.id = SPIN_KEYFRAMES_ID;
    el.textContent = `@keyframes ${SPIN_ANIMATION_NAME} { to { transform: rotate(360deg); } }`;
    document.head.appendChild(el);
  }, []);
}

interface ControlSpinnerProps {
  readonly size: number;
  readonly color: string;
}

/** 以 conic 邊框做圈：兩邊透明、其餘上色，轉起來即讀作進度未知的等待。不對外 export。 */
function ControlSpinner({ size, color }: ControlSpinnerProps) {
  useSpinKeyframes();
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: RADIUS.full,
        border: `${BUTTON_TOKENS.SPINNER_STROKE}px solid ${color}`,
        borderRightColor: 'transparent',
        borderTopColor: 'transparent',
        animation: `${SPIN_ANIMATION_NAME} ${BUTTON_TOKENS.SPINNER_MS}ms linear infinite`,
        boxSizing: 'border-box',
      }}
    />
  );
}

export interface ButtonProps {
  readonly label: ReactNode;
  /** 省略即 secondary，工具列常態。 */
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** ControlGlyph 的語意名。 */
  readonly iconLeft?: ControlGlyphName;
  readonly iconRight?: ControlGlyphName;
  /** 轉圈取代 iconLeft，label 留在原位、寬度不跳動。 */
  readonly loading?: boolean;
  readonly disabled?: boolean;
  /** 撐滿容器寬。 */
  readonly fullWidth?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly style?: CSSProperties;
}

export function Button({
  label,
  variant = 'secondary',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  style,
}: ButtonProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const { focusVisible, focusProps } = useFocusVisible<HTMLButtonElement>();

  const colors = BUTTON_TOKENS.COLORS_BY_VARIANT(theme)[variant];
  const off = disabled || loading;
  const live = hover && !off;

  const fg =
    disabled && !colors.useOpacityWhenDisabled
      ? theme.state.disabled.fg
      : live
        ? colors.fgHover
        : colors.fg;
  // 有框態失效：必要邊界退回裝飾線。
  const border =
    disabled && !colors.useOpacityWhenDisabled && colors.border !== 'transparent'
      ? theme.border.base
      : live
        ? colors.borderHover
        : colors.border;

  return (
    <button
      type="button"
      onClick={off ? undefined : onClick}
      disabled={off}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...focusProps}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: BUTTON_TOKENS.GAP,
        height: BUTTON_TOKENS.HEIGHT[size],
        width: fullWidth ? '100%' : undefined,
        padding: `0 ${BUTTON_TOKENS.PADDING_H[size]}px`,
        borderRadius: BUTTON_TOKENS.RADIUS,
        border: `${BUTTON_TOKENS.BORDER_WIDTH}px solid ${border}`,
        background: live ? colors.bgHover : colors.bg,
        color: fg,
        opacity: disabled && colors.useOpacityWhenDisabled ? theme.state.disabled.opacity : 1,
        cursor: disabled ? 'not-allowed' : loading ? 'progress' : 'pointer',
        fontFamily: FONT_FAMILY.base,
        ...textStyle(BUTTON_TOKENS.TEXT[size]),
        whiteSpace: 'nowrap',
        outline: 'none',
        boxShadow: focusVisible && !off ? controlFocusRing(theme) : 'none',
        transition: [
          `background ${BUTTON_TOKENS.TRANSITION_MS}ms ${CONTROL_SHARED_TOKENS.TRANSITION_EASING}`,
          `color ${BUTTON_TOKENS.TRANSITION_MS}ms ${CONTROL_SHARED_TOKENS.TRANSITION_EASING}`,
        ].join(', '),
        ...style,
      }}
    >
      {loading ? (
        <ControlSpinner size={BUTTON_TOKENS.ICON[size]} color={fg} />
      ) : (
        iconLeft && <ControlGlyph name={iconLeft} size={BUTTON_TOKENS.ICON[size]} color={fg} />
      )}
      {label}
      {iconRight && <ControlGlyph name={iconRight} size={BUTTON_TOKENS.ICON[size]} color={fg} />}
    </button>
  );
}
