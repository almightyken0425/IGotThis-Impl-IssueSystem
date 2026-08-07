// EmptyState · 無資料空狀態
//
// 來源：design git 的 `20_components/no2_data_display.jsx`（EmptyState 段）。
//
// compact 供看板欄內使用，其餘走表格與整頁尺寸。

import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  DATA_DISPLAY_COLORS,
  DATA_DISPLAY_TOKENS,
  FONT_FAMILY,
  ICON_SIZE,
  MOTION,
  SPACING,
  TYPOGRAPHY,
  useTheme,
} from '../../theme';
import { Glyph, focusStyleCss, typeStyleCss } from './internal';
import type { GlyphName } from './internal';

const E = DATA_DISPLAY_TOKENS.EMPTY_STATE;

export interface EmptyStateAction {
  readonly label: string;
  readonly onClick?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly icon?: GlyphName | undefined;
}

export interface EmptyStateProps {
  /** 內建 glyph 名，或自帶節點。 */
  readonly icon?: GlyphName | ReactNode;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly action?: EmptyStateAction | undefined;
  /** 看板欄內用，縮 icon 與上下留白。 */
  readonly compact?: boolean | undefined;
}

function isGlyphName(value: EmptyStateProps['icon']): value is GlyphName {
  return typeof value === 'string';
}

export function EmptyState({ icon = 'inbox', title, description, action, compact = false }: EmptyStateProps) {
  const { theme } = useTheme();
  const c = DATA_DISPLAY_COLORS.EMPTY_STATE(theme);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const box = compact ? E.ICON_BOX_COMPACT : E.ICON_BOX;
  const glyphSize = compact ? E.ICON_GLYPH_SIZE_COMPACT : E.ICON_GLYPH_SIZE;
  const actionDisabled = action?.disabled === true;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: E.GAP,
        padding: `${compact ? E.PADDING_Y_COMPACT : E.PADDING_Y}px ${E.PADDING_X}px`,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      <div
        style={{
          width: box,
          height: box,
          borderRadius: E.ICON_RADIUS,
          background: c.iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: c.iconFg,
        }}
      >
        {isGlyphName(icon) ? <Glyph name={icon} size={glyphSize} color={c.iconFg} /> : icon}
      </div>

      {title !== undefined && title !== null && (
        <div
          style={{
            color: c.titleFg,
            maxWidth: E.MAX_WIDTH,
            ...typeStyleCss(compact ? E.TITLE_TYPE_COMPACT : E.TITLE_TYPE, {
              fontWeight: TYPOGRAPHY.weight.medium,
            }),
          }}
        >
          {title}
        </div>
      )}

      {description !== undefined && description !== null && (
        <div style={{ color: c.descFg, maxWidth: E.MAX_WIDTH, ...typeStyleCss(E.DESC_TYPE) }}>{description}</div>
      )}

      {action !== undefined && (
        <button
          type="button"
          disabled={actionDisabled}
          onClick={action.onClick}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            marginTop: E.ACTION_MARGIN_TOP,
            height: E.ACTION_HEIGHT,
            padding: `0 ${E.ACTION_PADDING_X}px`,
            borderRadius: E.ACTION_RADIUS,
            display: 'inline-flex',
            alignItems: 'center',
            gap: SPACING.xs,
            background: actionDisabled ? 'transparent' : hover ? c.actionHoverBg : c.actionBg,
            color: actionDisabled ? c.disabledFg : c.actionFg,
            border: `${E.ACTION_BORDER_WIDTH}px solid ${actionDisabled ? c.actionBorder : 'transparent'}`,
            opacity: actionDisabled ? c.disabledOpacity : 1,
            cursor: actionDisabled ? 'not-allowed' : 'pointer',
            fontFamily: FONT_FAMILY.base,
            transition: `background ${MOTION.duration.instant}ms ${MOTION.easing.standard}`,
            ...typeStyleCss(E.ACTION_TYPE),
            ...(focus && !actionDisabled ? focusStyleCss(c, E.FOCUS_RING_WIDTH, E.FOCUS_RING_OFFSET) : null),
          }}
        >
          {action.icon !== undefined && (
            <Glyph name={action.icon} size={ICON_SIZE.sm} color={actionDisabled ? c.disabledFg : c.actionFg} />
          )}
          {action.label}
        </button>
      )}
    </div>
  );
}
