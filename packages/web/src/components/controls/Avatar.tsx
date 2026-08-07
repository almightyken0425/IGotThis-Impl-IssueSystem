// Avatar · 負責人頭像
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，Avatar 段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// Assignee 欄用。無圖時取姓名字首，取法見同目錄 avatarInitials。

import type { CSSProperties } from 'react';

import { AVATAR_TOKENS, FONT_FAMILY, useTheme } from '../../theme';
import type { AvatarTone } from '../../theme';
import { avatarInitials } from './avatarInitials';
import { textStyle } from './textStyle';

export type AvatarSize = keyof typeof AVATAR_TOKENS.SIZE;

export interface AvatarProps {
  readonly name: string;
  /** 省略即 primary。 */
  readonly tone?: AvatarTone;
  readonly size?: AvatarSize;
  readonly style?: CSSProperties;
}

export function Avatar({ name, tone = 'primary', size = 'md', style }: AvatarProps) {
  const { theme } = useTheme();
  const colors = AVATAR_TOKENS.COLORS_BY_TONE(theme)[tone];

  return (
    <span
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: AVATAR_TOKENS.SIZE[size],
        height: AVATAR_TOKENS.SIZE[size],
        flexShrink: 0,
        borderRadius: AVATAR_TOKENS.RADIUS,
        border: `${AVATAR_TOKENS.BORDER_WIDTH}px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
        fontFamily: FONT_FAMILY.base,
        ...textStyle(AVATAR_TOKENS.TEXT[size]),
        userSelect: 'none',
        ...style,
      }}
    >
      {avatarInitials(name)}
    </span>
  );
}
