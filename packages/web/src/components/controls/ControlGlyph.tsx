// ControlGlyph · 控件組自製 SVG 圖示
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，CONTROL_GLYPH_PATHS 與 ControlGlyph 兩段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// stroke 型 24 格線稿，只承載本組控件所需的少量 UI glyph。
// 圖示庫成形後移出本檔、改由共用 icon 檔提供，元件呼叫端不變。

import { CONTROL_SHARED_TOKENS, ICON_SIZE } from '../../theme';

export const CONTROL_GLYPH_PATHS = {
  'chevron-down': 'M6 9.5 12 15.5 18 9.5',
  'chevron-up': 'M6 14.5 12 8.5 18 14.5',
  'chevron-right': 'M9.5 6 15.5 12 9.5 18',
  x: 'M6.5 6.5 17.5 17.5 M17.5 6.5 6.5 17.5',
  check: 'M5 12.5 9.5 17 19 7.5',
  minus: 'M6 12H18',
  plus: 'M12 6V18 M6 12H18',
  search: 'M10.5 4.5A6 6 0 1 0 10.5 16.5A6 6 0 1 0 10.5 4.5 M15 15 19.5 19.5',
  columns: 'M4 5H20V19H4Z M10 5V19 M15 5V19',
  sort: 'M4 6.5H18 M4 12H13 M4 17.5H8',
  filter: 'M4 5H20L13.5 12.5V18.5L10.5 20V12.5Z',
  dots: 'M6 12H6.01 M12 12H12.01 M18 12H18.01',
} as const;

/** 語意名。design 端接受任意字串、查無即回 null；impl 收斂成聯集，打錯在編譯期擋下。 */
export type ControlGlyphName = keyof typeof CONTROL_GLYPH_PATHS;

export interface ControlGlyphProps {
  readonly name: ControlGlyphName;
  /** 吃 ICON_SIZE 階梯，省略即 md。 */
  readonly size?: number;
  /** 由呼叫端給 token 色；glyph 不自帶顏色。 */
  readonly color: string;
  readonly strokeWidth?: number;
}

export function ControlGlyph({
  name,
  size = ICON_SIZE.md,
  color,
  strokeWidth = CONTROL_SHARED_TOKENS.GLYPH_STROKE.base,
}: ControlGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      <path d={CONTROL_GLYPH_PATHS[name]} />
    </svg>
  );
}
