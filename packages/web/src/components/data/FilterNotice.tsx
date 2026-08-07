// FilterNotice · 權限過濾標示列
//
// 來源：design git 的 `20_components/no2_data_display.jsx`（FilterNotice 段）。
//
// 資料由 filterViewByPermission 產出；count 為 0 時本元件不渲染，
// 對應 spec 的「無被濾工單則不顯示本區」。

import { DATA_DISPLAY_COLORS, DATA_DISPLAY_TOKENS, FONT_FAMILY, NUMERIC_FONT_VARIANT, SPACING, useTheme } from '../../theme';
import { Glyph, typeStyleCss } from './internal';

const F = DATA_DISPLAY_TOKENS.FILTER_NOTICE;

export type FilterNoticeTone = 'info' | 'warning';

export interface FilterNoticeProps {
  /** 被濾掉的工單筆數；0 或省略則整個元件不渲染。 */
  readonly count?: number | undefined;
  readonly reason?: string | undefined;
  readonly tone?: FilterNoticeTone | undefined;
  /** 計數單位，預設「筆」。 */
  readonly unit?: string | undefined;
}

export function FilterNotice({ count = 0, reason = '無讀取權', tone = 'info', unit = '筆' }: FilterNoticeProps) {
  const { theme } = useTheme();
  const palette = DATA_DISPLAY_COLORS.FILTER_NOTICE(theme);
  const c = palette[tone];

  if (count === 0) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: F.GAP,
        minHeight: F.MIN_HEIGHT,
        padding: `${F.PADDING_Y}px ${F.PADDING_X}px`,
        background: c.bg,
        color: c.fg,
        borderRadius: F.RADIUS,
        borderLeft: `${F.ACCENT_WIDTH}px solid ${c.accent}`,
        fontFamily: FONT_FAMILY.base,
        ...typeStyleCss(F.TEXT_TYPE),
      }}
    >
      <Glyph name="funnel" size={F.ICON_SIZE} color={c.fg} style={{ flexShrink: 0 }} />
      <span>
        權限濾除
        <span
          style={{
            fontVariantNumeric: NUMERIC_FONT_VARIANT,
            fontWeight: F.COUNT_WEIGHT,
            margin: `0 ${SPACING['2xs']}px`,
          }}
        >
          {count}
        </span>
        {unit}
      </span>
      <span style={{ color: c.fg, ...typeStyleCss(F.REASON_TYPE) }}>· {reason}</span>
    </div>
  );
}
