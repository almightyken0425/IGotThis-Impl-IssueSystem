// SectionDivider · 已排序區與未排序區的分隔
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 與 design 端的唯一差異：theme 不再逐層傳 prop，改由 useTheme() 取當下主題。
//
// 標題 + 計數；未排序區可帶 hint 說明收錄規則。
// 拖曳跨區時 active 為真，整條分隔提亮，指出這是可放置的區界。

import type { CSSProperties, ReactNode } from 'react';

import {
  FONT_FAMILY,
  GANTT_TOKENS,
  NUMERIC_FONT_VARIANT,
  TYPE_STYLES,
  resolveGanttColors,
  useTheme,
} from '../../theme';

import { ganttType } from './internal';

export interface SectionDividerProps {
  /** 區塊標題，如「已排序」。 */
  readonly title: string;
  /** 該區的工單數。給了才畫計數 pill。 */
  readonly count?: number;
  /** 覆寫計數 pill 的顯示文字，如「12 張」。省略即直接顯示 count。 */
  readonly countLabel?: ReactNode;
  /** 收錄規則說明，只在未排序區用。 */
  readonly hint?: ReactNode;
  /** 拖曳跨區中，整條分隔提亮為可放置的區界。 */
  readonly active?: boolean;
  readonly style?: CSSProperties;
}

export function SectionDivider({
  title,
  count,
  countLabel,
  hint,
  active = false,
  style,
}: SectionDividerProps) {
  const { theme } = useTheme();
  const colors = resolveGanttColors(theme);
  const hasCount = typeof count === 'number';

  return (
    <div
      role="separator"
      aria-label={hasCount ? `${title} ${count}` : title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: GANTT_TOKENS.ROW_GAP,
        height: GANTT_TOKENS.SECTION_DIVIDER_HEIGHT,
        padding: `0 ${GANTT_TOKENS.SECTION_DIVIDER_PADDING_H}px`,
        background: colors.sectionBg,
        borderTop: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${
          active ? colors.dropIndicator : colors.sectionLine
        }`,
        borderBottom: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${
          active ? colors.dropIndicator : colors.sectionLine
        }`,
        fontFamily: FONT_FAMILY.base,
        transition: `border-color ${GANTT_TOKENS.ROW_TRANSITION_MS}ms ${GANTT_TOKENS.EASING}`,
        ...style,
      }}
    >
      <span
        style={{
          ...ganttType(TYPE_STYLES.overline),
          color: colors.textSecondary,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>

      {hasCount && (
        <span
          style={{
            height: GANTT_TOKENS.SECTION_COUNT_HEIGHT,
            padding: `0 ${GANTT_TOKENS.SECTION_COUNT_PADDING_H}px`,
            borderRadius: GANTT_TOKENS.SECTION_COUNT_RADIUS,
            border: `${GANTT_TOKENS.GRID_LINE_WIDTH}px solid ${colors.controlBorder}`,
            display: 'inline-flex',
            alignItems: 'center',
            ...ganttType(TYPE_STYLES.caption),
            color: colors.textSecondary,
            fontVariantNumeric: NUMERIC_FONT_VARIANT,
            whiteSpace: 'nowrap',
          }}
        >
          {countLabel ?? count}
        </span>
      )}

      {hint !== undefined && hint !== null && (
        <span
          style={{
            ...ganttType(TYPE_STYLES.caption),
            color: colors.textTertiary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
