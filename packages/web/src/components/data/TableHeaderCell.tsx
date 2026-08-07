// TableHeaderCell · 欄位標題格
//
// 來源：design git 的 `20_components/no2_data_display.jsx`（TableHeaderCell 段）。
//
// 可排序時渲染成 button，含 hover / focus 與排序指示；不可排序時是靜態 div。
//
// 受控：本元件不記排序狀態。目前狀態由 `sort` 傳入，點擊時把「下一個狀態」
// 交給 `onSortChange`，方向由 `nextSortState` 這條預設規則算出來——
// 畫面層要改成三態循環或多欄排序，覆寫掉這個回呼即可，元件不必動。

import { useState } from 'react';
import type { CSSProperties } from 'react';

import { DATA_DISPLAY_COLORS, DATA_DISPLAY_TOKENS, FONT_FAMILY, SPACING, useTheme } from '../../theme';
import type { Density } from '../../theme';
import { Glyph, Truncate, alignToJustify, focusStyleCss, typeStyleCss } from './internal';
import { nextSortState } from './types';
import type { SortState, TableColumn } from './types';

const T = DATA_DISPLAY_TOKENS.TABLE;

export interface TableHeaderCellProps {
  readonly column: TableColumn;
  readonly density?: Density | undefined;
  /** 目前排序狀態，null 或省略代表未排序。 */
  readonly sort?: SortState | null | undefined;
  readonly onSortChange?: ((next: SortState) => void) | undefined;
}

export function TableHeaderCell({ column, density = 'base', sort, onSortChange }: TableHeaderCellProps) {
  const { theme } = useTheme();
  const c = DATA_DISPLAY_COLORS.TABLE(theme);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const current = sort ?? null;
  const active = current !== null && current.key === column.key;
  const direction = active ? current.direction : null;
  const sortable = column.sortable === true;

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: alignToJustify(column.align),
    gap: SPACING.xs,
    width: '100%',
    height: '100%',
    minWidth: 0,
    padding: `0 ${T.CELL_PADDING_X_BY_DENSITY[density]}px`,
    border: `${T.OUTER_BORDER_WIDTH}px solid transparent`,
    background: hover && sortable ? c.headerHoverBg : 'transparent',
    color: active ? c.headerActiveFg : c.headerFg,
    fontFamily: FONT_FAMILY.base,
    textAlign: 'left',
    cursor: sortable ? 'pointer' : 'default',
    transition: `background ${T.TRANSITION_MS}ms ${T.TRANSITION_EASING}`,
    ...typeStyleCss(T.HEADER_TYPE),
    ...(focus ? focusStyleCss(c, T.FOCUS_RING_WIDTH, T.FOCUS_RING_OFFSET) : null),
  };

  // 未排序但可排序的欄位在 hover 時給灰階雙箭頭，暗示「這裡點得下去」；
  // 兩者都不成立時佔一個等寬空位，避免標題文字在 hover 時左右跳動。
  const indicator = active ? (
    <Glyph name={direction === 'desc' ? 'sort-desc' : 'sort-asc'} size={T.SORT_ICON_SIZE} color={c.headerActiveFg} />
  ) : sortable && hover ? (
    <Glyph name="sort-none" size={T.SORT_ICON_SIZE} color={c.rowMutedFg} />
  ) : (
    <span style={{ width: T.SORT_ICON_SIZE, flexShrink: 0 }} />
  );

  const content = (
    <>
      <Truncate title={column.label}>{column.label}</Truncate>
      {indicator}
    </>
  );

  if (!sortable) {
    return (
      <div role="columnheader" style={style}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="columnheader"
      aria-sort={active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}
      onClick={() => onSortChange?.(nextSortState(current, column.key))}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={style}
    >
      {content}
    </button>
  );
}
