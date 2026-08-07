// TableCell 系列 · 工單表格的儲存格
//
// 來源：design git 的 `20_components/no2_data_display.jsx`（TableCell 系列段）。
//
// 一個基底格加六個型別格：文字 / 編號 / 狀態 / 使用者 / 日期 / 數字。
// 編號與數字統一 NUMERIC_FONT_VARIANT，欄距吃 density。
//
// 與 design 的差異只有一處：theme 不再逐層傳，改由 useTheme() 就地取。

import type { CSSProperties, ReactNode } from 'react';

import { DATA_DISPLAY_COLORS, DATA_DISPLAY_TOKENS, FONT_FAMILY, NUMERIC_FONT_VARIANT, useTheme } from '../../theme';
import type { Density } from '../../theme';
import { AvatarSlot, BadgeSlot, Truncate, alignToJustify, typeStyleCss } from './internal';
import { toDateValue, toPlainText, toStatusValue, toUserValue } from './types';
import type { CellAlign } from './types';

const T = DATA_DISPLAY_TOKENS.TABLE;

/** 無值時的佔位符。空字串與 null 都收斂到這一個字元，掃描時不會誤讀成漏渲染。 */
const PLACEHOLDER = '—';

// ─── 基底格 ──────────────────────────────────────────────────

export interface TableCellProps {
  readonly density?: Density | undefined;
  readonly align?: CellAlign | undefined;
  /** 次要文字，套 rowMutedFg。 */
  readonly muted?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly style?: CSSProperties | undefined;
  readonly children?: ReactNode;
}

export function TableCell({
  density = 'base',
  align = 'left',
  muted = false,
  disabled = false,
  style,
  children,
}: TableCellProps) {
  const { theme } = useTheme();
  const c = DATA_DISPLAY_COLORS.TABLE(theme);

  return (
    <div
      role="cell"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: alignToJustify(align),
        gap: T.CELL_INNER_GAP,
        minWidth: 0,
        height: '100%',
        padding: `0 ${T.CELL_PADDING_X_BY_DENSITY[density]}px`,
        color: disabled ? c.disabledFg : muted ? c.rowMutedFg : 'inherit',
        fontFamily: FONT_FAMILY.base,
        ...typeStyleCss(T.CELL_TYPE),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── 型別格共用 props ────────────────────────────────────────

interface TypedCellProps {
  readonly density?: Density | undefined;
  readonly align?: CellAlign | undefined;
  readonly disabled?: boolean | undefined;
}

// ─── 文字格 ──────────────────────────────────────────────────

export interface TableTextCellProps extends TypedCellProps {
  readonly value: ReactNode;
  readonly muted?: boolean | undefined;
}

export function TableTextCell({ density, align, muted, disabled, value }: TableTextCellProps) {
  const title = typeof value === 'string' ? value : undefined;
  return (
    <TableCell density={density} align={align} muted={muted} disabled={disabled}>
      <Truncate title={title}>{value}</Truncate>
    </TableCell>
  );
}

// ─── 編號格 ──────────────────────────────────────────────────
// mono + tabular-nums，色走 primary.main，雙主題都過 AA。

export interface TableKeyCellProps extends TypedCellProps {
  readonly value: string;
  readonly onClick?: ((event: React.MouseEvent<HTMLSpanElement>) => void) | undefined;
}

export function TableKeyCell({ density, align, disabled, value, onClick }: TableKeyCellProps) {
  const { theme } = useTheme();
  const c = DATA_DISPLAY_COLORS.TABLE(theme);
  const clickable = onClick !== undefined && disabled !== true;

  return (
    <TableCell density={density} align={align} disabled={disabled}>
      <Truncate title={value}>
        <span
          onClick={clickable ? onClick : undefined}
          style={{
            fontFamily: FONT_FAMILY.mono,
            fontVariantNumeric: NUMERIC_FONT_VARIANT,
            color: disabled === true ? c.disabledFg : c.keyFg,
            cursor: clickable ? 'pointer' : 'inherit',
            ...typeStyleCss(T.KEY_TYPE, { fontWeight: T.KEY_WEIGHT }),
          }}
        >
          {value}
        </span>
      </Truncate>
    </TableCell>
  );
}

// ─── 狀態格 ──────────────────────────────────────────────────

export interface TableStatusCellProps extends TypedCellProps {
  /** 字串即 label；物件另帶 tone 決定 badge 配色。 */
  readonly status: unknown;
}

export function TableStatusCell({ density, align, disabled, status }: TableStatusCellProps) {
  const { theme } = useTheme();
  const c = DATA_DISPLAY_COLORS.TABLE(theme);
  const value = toStatusValue(status);

  if (value === null) {
    return (
      <TableCell density={density} align={align} muted disabled={disabled}>
        {PLACEHOLDER}
      </TableCell>
    );
  }

  return (
    <TableCell density={density} align={align} disabled={disabled}>
      <BadgeSlot
        theme={theme}
        label={value.label}
        tone={value.tone}
        geometry={{
          height: T.BADGE_HEIGHT,
          radius: T.BADGE_RADIUS,
          paddingX: T.BADGE_PADDING_X,
          typeStyle: T.BADGE_TYPE,
          dot: T.BADGE_DOT,
        }}
        neutralBg={c.neutralBadgeBg}
        neutralFg={c.neutralBadgeFg}
      />
    </TableCell>
  );
}

// ─── 使用者格 ────────────────────────────────────────────────

export interface TableUserCellProps extends TypedCellProps {
  /** 字串即姓名；物件讀 name。 */
  readonly user: unknown;
  readonly showName?: boolean | undefined;
}

export function TableUserCell({ density, align, disabled, user, showName = true }: TableUserCellProps) {
  const { theme } = useTheme();
  const c = DATA_DISPLAY_COLORS.TABLE(theme);
  const value = toUserValue(user);

  if (value === null) {
    return (
      <TableCell density={density} align={align} muted disabled={disabled}>
        {PLACEHOLDER}
      </TableCell>
    );
  }

  return (
    <TableCell density={density} align={align} disabled={disabled}>
      <AvatarSlot
        name={value.name}
        size={T.AVATAR_SIZE}
        bg={c.avatarBg}
        fg={c.avatarFg}
        typeStyle={T.AVATAR_TYPE}
      />
      {showName && <Truncate title={value.name}>{value.name}</Truncate>}
    </TableCell>
  );
}

// ─── 日期格 ──────────────────────────────────────────────────
// tabular-nums；逾期與將到期各自吃 status 的 _fg 深階。

export interface TableDateCellProps extends TypedCellProps {
  /** 字串即顯示文字；物件另帶 tone 決定逾期或將到期的色。 */
  readonly date: unknown;
}

export function TableDateCell({ density, align, disabled, date }: TableDateCellProps) {
  const { theme } = useTheme();
  const c = DATA_DISPLAY_COLORS.TABLE(theme);
  const value = toDateValue(date);
  const tone = value?.tone;
  const fg =
    disabled === true ? c.disabledFg : tone === 'overdue' ? c.overdueFg : tone === 'soon' ? c.dueSoonFg : undefined;
  const label = value === null || value.label === '' ? PLACEHOLDER : value.label;

  return (
    <TableCell
      density={density}
      align={align}
      disabled={disabled}
      style={{ fontVariantNumeric: NUMERIC_FONT_VARIANT, color: fg }}
    >
      <Truncate title={label}>{label}</Truncate>
    </TableCell>
  );
}

// ─── 數字格 ──────────────────────────────────────────────────

export interface TableNumberCellProps extends TypedCellProps {
  readonly value: unknown;
}

export function TableNumberCell({ density, align = 'right', disabled, value }: TableNumberCellProps) {
  const text = toPlainText(value);

  return (
    <TableCell
      density={density}
      align={align}
      disabled={disabled}
      style={{ fontVariantNumeric: NUMERIC_FONT_VARIANT }}
    >
      <Truncate>{text === '' ? PLACEHOLDER : text}</Truncate>
    </TableCell>
  );
}
