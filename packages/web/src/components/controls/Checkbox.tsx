// Checkbox · 多選
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，Checkbox 段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// 表格列多選與欄位顯示設定的顯示 / 隱藏開關用。
// indeterminate 供「全選」表頭的部分選取態；視覺走橫槓，
// 同時寫進原生 input 的 indeterminate 屬性，讓輔助技術讀得到混合態。

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { CHECKBOX_TOKENS, CONTROL_SHARED_TOKENS, FONT_FAMILY, controlFocusRing, useTheme } from '../../theme';
import { ControlGlyph } from './ControlGlyph';
import { textStyle } from './textStyle';
import { useFocusVisible } from './useFocusVisible';

export type CheckboxSize = keyof typeof CHECKBOX_TOKENS.BOX;

export interface CheckboxProps {
  readonly checked?: boolean;
  /** 部分選取態，視覺優先於 checked。 */
  readonly indeterminate?: boolean;
  readonly label?: ReactNode;
  readonly size?: CheckboxSize;
  readonly disabled?: boolean;
  readonly onChange?: (checked: boolean) => void;
  readonly style?: CSSProperties;
}

export function Checkbox({
  checked = false,
  indeterminate = false,
  label,
  size = 'md',
  disabled = false,
  onChange,
  style,
}: CheckboxProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const { focusVisible, focusProps } = useFocusVisible<HTMLInputElement>();
  const inputRef = useRef<HTMLInputElement>(null);

  // indeterminate 只有 DOM 屬性、沒有 HTML attribute，必須逐次寫回。
  useEffect(() => {
    const input = inputRef.current;
    if (input) input.indeterminate = indeterminate;
  }, [indeterminate]);

  const colors = CHECKBOX_TOKENS.COLORS(theme);
  const on = checked || indeterminate;
  const live = hover && !disabled;

  // 已勾的 disabled 走整體降 opacity（見 token 檔 disabled 三態分流），底色不另換。
  const boxBg = on ? colors.bgChecked : colors.bg;
  const boxBorder = disabled
    ? colors.disabledBorder
    : on
      ? colors.borderChecked
      : live
        ? colors.borderHover
        : colors.border;

  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: CHECKBOX_TOKENS.GAP,
        height: CHECKBOX_TOKENS.HIT_HEIGHT[size],
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && on ? theme.state.disabled.opacity : 1,
        userSelect: 'none',
        ...style,
      }}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        {...focusProps}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, margin: 0 }}
      />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: CHECKBOX_TOKENS.BOX[size],
          height: CHECKBOX_TOKENS.BOX[size],
          flexShrink: 0,
          borderRadius: CHECKBOX_TOKENS.RADIUS,
          border: `${CHECKBOX_TOKENS.BORDER_WIDTH}px solid ${boxBorder}`,
          background: boxBg,
          boxShadow: focusVisible && !disabled ? controlFocusRing(theme) : 'none',
          transition: `background ${CHECKBOX_TOKENS.TRANSITION_MS}ms ${CONTROL_SHARED_TOKENS.TRANSITION_EASING}`,
        }}
      >
        {on && (
          <ControlGlyph
            name={indeterminate ? 'minus' : 'check'}
            size={CHECKBOX_TOKENS.BOX[size]}
            color={colors.mark}
            strokeWidth={CHECKBOX_TOKENS.MARK_STROKE}
          />
        )}
      </span>
      {label && (
        <span
          style={{
            fontFamily: FONT_FAMILY.base,
            ...textStyle(CHECKBOX_TOKENS.LABEL_TEXT[size]),
            color: disabled ? colors.disabledFg : colors.labelFg,
          }}
        >
          {label}
        </span>
      )}
    </label>
  );
}
