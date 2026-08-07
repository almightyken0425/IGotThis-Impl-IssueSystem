// Select · 下拉選單
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，Select 與 SelectOption 兩段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// 排序依據、分組依據用。trigger + level2 浮層 menu，self-contained 開合狀態。
// design 端的 SelectOption 元件在此更名 SelectMenuItem，把 SelectOption 讓給
// 對外的選項型別；元件本身仍不對外 export，呼叫端零差異。

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  CONTROL_SHARED_TOKENS,
  FONT_FAMILY,
  SELECT_TOKENS,
  controlFocusRing,
  controlShadow,
  useTheme,
} from '../../theme';
import type { Theme } from '../../theme';
import { ControlGlyph } from './ControlGlyph';
import { textStyle } from './textStyle';
import { useFocusVisible } from './useFocusVisible';

export type SelectSize = keyof typeof SELECT_TOKENS.HEIGHT;

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** (literal: 浮層層級。token 層目前無 z-index 階梯，沿用 design 值、待階梯成形後回收) */
const MENU_Z_INDEX = 50;

export interface SelectProps {
  /** 行內前綴，如「排序」；渲染成「排序:」與值同行、色階低一階。 */
  readonly prefix?: string;
  readonly options?: readonly SelectOption[];
  /** 受控選中值；找不到對應 option 時顯示 placeholder。 */
  readonly value?: string;
  readonly placeholder?: string;
  readonly onChange?: (value: string) => void;
  readonly size?: SelectSize;
  readonly disabled?: boolean;
  readonly style?: CSSProperties;
}

export function Select({
  prefix,
  options = [],
  value,
  placeholder = '請選擇',
  onChange,
  size = 'md',
  disabled = false,
  style,
}: SelectProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const { focusVisible, focusProps } = useFocusVisible<HTMLButtonElement>();
  const wrapRef = useRef<HTMLDivElement>(null);

  // 點外面或按 Escape 收合。open 才掛 listener，收合時解除。
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      if (wrapRef.current && target instanceof Node && !wrapRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const live = (hover || open) && !disabled;
  const fg = disabled ? theme.state.disabled.fg : theme.text.primary;
  const border = disabled
    ? theme.border.base
    : open
      ? theme.state.focus.ring
      : theme.border.input;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', ...style }}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        {...focusProps}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: SELECT_TOKENS.GAP,
          height: SELECT_TOKENS.HEIGHT[size],
          padding: `0 ${SELECT_TOKENS.PADDING_RIGHT}px 0 ${SELECT_TOKENS.PADDING_LEFT}px`,
          position: 'relative',
          borderRadius: SELECT_TOKENS.RADIUS,
          border: `${SELECT_TOKENS.BORDER_WIDTH}px solid ${border}`,
          background: live ? theme.bg.surface_hover : theme.bg.surface,
          color: fg,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: FONT_FAMILY.base,
          ...textStyle(SELECT_TOKENS.TEXT[size]),
          whiteSpace: 'nowrap',
          outline: 'none',
          boxShadow: focusVisible && !disabled ? controlFocusRing(theme) : 'none',
          transition: `background ${SELECT_TOKENS.TRANSITION_MS}ms ${CONTROL_SHARED_TOKENS.TRANSITION_EASING}`,
        }}
      >
        {prefix && (
          <span
            style={{
              ...textStyle(SELECT_TOKENS.PREFIX_TEXT),
              color: disabled ? theme.state.disabled.fg : theme.text.tertiary,
            }}
          >
            {prefix}:
          </span>
        )}
        <span style={{ color: selected ? fg : theme.text.tertiary }}>
          {selected ? selected.label : placeholder}
        </span>
        <span
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: SELECT_TOKENS.PADDING_LEFT,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ControlGlyph
            name={open ? 'chevron-up' : 'chevron-down'}
            size={SELECT_TOKENS.CHEVRON_SIZE}
            color={disabled ? theme.state.disabled.fg : theme.text.tertiary}
          />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: MENU_Z_INDEX,
            marginTop: SELECT_TOKENS.MENU.OFFSET,
            minWidth: SELECT_TOKENS.MENU.MIN_WIDTH,
            maxHeight: SELECT_TOKENS.MENU.MAX_HEIGHT,
            overflowY: 'auto',
            padding: SELECT_TOKENS.MENU.PADDING,
            borderRadius: SELECT_TOKENS.MENU.RADIUS,
            border: `${SELECT_TOKENS.BORDER_WIDTH}px solid ${theme.border.base}`,
            background: theme.bg.surface,
            boxShadow: controlShadow(theme, SELECT_TOKENS.MENU.ELEVATION),
            fontFamily: FONT_FAMILY.base,
          }}
        >
          {options.map((option) => (
            <SelectMenuItem
              key={option.value}
              option={option}
              selected={option.value === value}
              theme={theme}
              onPick={() => {
                onChange?.(option.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SelectMenuItemProps {
  readonly option: SelectOption;
  readonly selected: boolean;
  readonly theme: Theme;
  readonly onPick: () => void;
}

/** 單列選項；hover 與選中兩態分開，選中列以 trailing check 表達。不對外 export。 */
function SelectMenuItem({ option, selected, theme, onPick }: SelectMenuItemProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SELECT_TOKENS.GAP,
        height: SELECT_TOKENS.MENU.ITEM_HEIGHT,
        padding: `0 ${SELECT_TOKENS.MENU.ITEM_PADDING_H}px`,
        borderRadius: SELECT_TOKENS.MENU.ITEM_RADIUS,
        background: selected
          ? theme.state.selected.bg
          : hover
            ? theme.state.hover.bg
            : 'transparent',
        color: selected ? theme.state.selected.fg : theme.text.primary,
        ...textStyle(SELECT_TOKENS.MENU.ITEM_TEXT),
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{option.label}</span>
      {selected && (
        <ControlGlyph
          name="check"
          size={SELECT_TOKENS.MENU.CHECK_SIZE}
          color={theme.state.selected.fg}
          strokeWidth={CONTROL_SHARED_TOKENS.GLYPH_STROKE.mark}
        />
      )}
    </div>
  );
}
