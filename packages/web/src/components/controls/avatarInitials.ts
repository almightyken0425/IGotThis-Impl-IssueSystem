// avatarInitials · 無圖頭像的姓名字首
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，同名函式。
//
// 中日文取末一字（姓氏在前、辨識度在後段），拉丁字母取首字母、
// 有空白則取前兩段首字母。

import { AVATAR_TOKENS } from '../../theme';

export function avatarInitials(name: string | null | undefined): string {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return '';

  const parts = trimmed.split(/\s+/);
  const isLatin = /^[A-Za-z]/.test(trimmed);

  if (parts.length > 1 && isLatin) {
    return parts
      .slice(0, AVATAR_TOKENS.INITIAL_MAX)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }
  if (isLatin) return trimmed.slice(0, 1).toUpperCase();
  return trimmed.slice(-1);
}
