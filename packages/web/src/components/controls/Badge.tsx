// Badge · 狀態標籤
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，Badge 段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// Status 欄與權限過濾標示等處用。tone 吃 semantic 四色與 neutral 中性色；
// 文字一律走該 tone 的 _fg，圓點同吃 _fg（見 token 檔的對比說明）。
// dot 預設開：色彩之外多一層形狀線索，色覺障礙者不靠色相也能分辨。

import type { CSSProperties, ReactNode } from 'react';

import { BADGE_TOKENS, FONT_FAMILY, RADIUS, useTheme } from '../../theme';
import type { BadgeTone } from '../../theme';
import { textStyle } from './textStyle';

export interface BadgeProps {
  readonly label: ReactNode;
  /** 省略即 neutral。 */
  readonly tone?: BadgeTone;
  readonly dot?: boolean;
  readonly style?: CSSProperties;
}

export function Badge({ label, tone = 'neutral', dot = true, style }: BadgeProps) {
  const { theme } = useTheme();
  const colors = BADGE_TOKENS.COLORS_BY_TONE(theme)[tone];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: BADGE_TOKENS.GAP,
        height: BADGE_TOKENS.HEIGHT,
        padding: `0 ${BADGE_TOKENS.PADDING_H}px`,
        borderRadius: BADGE_TOKENS.RADIUS,
        background: colors.bg,
        color: colors.fg,
        fontFamily: FONT_FAMILY.base,
        ...textStyle(BADGE_TOKENS.TEXT),
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: BADGE_TOKENS.DOT_SIZE,
            height: BADGE_TOKENS.DOT_SIZE,
            borderRadius: RADIUS.full,
            background: colors.dot,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}
