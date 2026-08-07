// TextInput · 文字輸入
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，TextInput 與 ClearButton 兩段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// 搜尋與篩選用。leadingIcon 常給 'search'；有值時右側出現清除鈕。

import { useState } from 'react';
import type { CSSProperties } from 'react';

import {
  CONTROL_SHARED_TOKENS,
  FONT_FAMILY,
  RADIUS,
  TEXT_INPUT_TOKENS,
  controlFocusRing,
  useTheme,
} from '../../theme';
import type { Theme } from '../../theme';
import { ControlGlyph } from './ControlGlyph';
import type { ControlGlyphName } from './ControlGlyph';
import { textStyle } from './textStyle';
import { useFocusVisible } from './useFocusVisible';

export type TextInputSize = keyof typeof TEXT_INPUT_TOKENS.HEIGHT;

export interface TextInputProps {
  readonly value?: string;
  readonly placeholder?: string;
  readonly leadingIcon?: ControlGlyphName;
  readonly onChange?: (value: string) => void;
  /** 省略即由 onChange 收空字串。 */
  readonly onClear?: () => void;
  readonly size?: TextInputSize;
  readonly disabled?: boolean;
  readonly clearable?: boolean;
  readonly fullWidth?: boolean;
  readonly style?: CSSProperties;
}

export function TextInput({
  value = '',
  placeholder = '',
  leadingIcon,
  onChange,
  onClear,
  size = 'md',
  disabled = false,
  clearable = true,
  fullWidth = false,
  style,
}: TextInputProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const { focusVisible, focusProps } = useFocusVisible<HTMLInputElement>();

  const showClear = clearable && value !== '' && !disabled;
  const border = disabled
    ? theme.border.base
    : focusVisible
      ? theme.state.focus.ring
      : theme.border.input;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: TEXT_INPUT_TOKENS.GAP,
        height: TEXT_INPUT_TOKENS.HEIGHT[size],
        width: fullWidth ? '100%' : undefined,
        padding: `0 ${TEXT_INPUT_TOKENS.PADDING_H}px`,
        borderRadius: TEXT_INPUT_TOKENS.RADIUS,
        border: `${TEXT_INPUT_TOKENS.BORDER_WIDTH}px solid ${border}`,
        background: disabled
          ? theme.bg.surface_dim
          : hover && !focusVisible
            ? theme.bg.surface_hover
            : theme.bg.surface,
        boxShadow: focusVisible && !disabled ? controlFocusRing(theme) : 'none',
        transition: `background ${TEXT_INPUT_TOKENS.TRANSITION_MS}ms ${CONTROL_SHARED_TOKENS.TRANSITION_EASING}`,
        ...style,
      }}
    >
      {leadingIcon && (
        <ControlGlyph
          name={leadingIcon}
          size={TEXT_INPUT_TOKENS.LEADING_ICON[size]}
          color={disabled ? theme.state.disabled.fg : theme.text.tertiary}
        />
      )}
      <input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        {...focusProps}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          outline: 'none',
          padding: 0,
          fontFamily: FONT_FAMILY.base,
          ...textStyle(TEXT_INPUT_TOKENS.TEXT[size]),
          color: disabled ? theme.state.disabled.fg : theme.text.primary,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      {showClear && (
        <ClearButton
          theme={theme}
          onClick={() => {
            if (onClear) onClear();
            else onChange?.('');
          }}
        />
      )}
    </div>
  );
}

interface ClearButtonProps {
  readonly theme: Theme;
  readonly onClick: () => void;
}

/** 清除鈕；圓形點擊區、hover 才浮出底色。不對外 export。 */
function ClearButton({ theme, onClick }: ClearButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title="清除"
      aria-label="清除"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: TEXT_INPUT_TOKENS.CLEAR_HIT,
        height: TEXT_INPUT_TOKENS.CLEAR_HIT,
        flexShrink: 0,
        padding: 0,
        borderRadius: RADIUS.full,
        border: 'none',
        background: hover ? theme.state.hover.bg : 'transparent',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      <ControlGlyph
        name="x"
        size={TEXT_INPUT_TOKENS.CLEAR_ICON_SIZE}
        color={hover ? theme.text.primary : theme.text.tertiary}
        strokeWidth={CONTROL_SHARED_TOKENS.GLYPH_STROKE.bold}
      />
    </button>
  );
}
