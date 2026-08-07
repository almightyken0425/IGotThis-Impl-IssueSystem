// Controls · 基礎控件組的統一匯出口
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，該檔末尾掛上 window 的那組 export。
//
// 八件基礎控件：Button / IconButton / Select / TextInput / Checkbox / Badge /
// Avatar / Chip，外加 ControlGlyph 圖示元件與 avatarInitials 工具函式。
//
// 消費畫面：
//   - ListScreen 檢視工具列 — Select（排序依據、分組依據）、
//     IconButton（欄位顯示設定入口）、TextInput（搜尋）、Chip（已套用篩選）
//   - ListScreen 工單表格 — Checkbox（列多選）、Badge（Status 欄）、
//     Avatar（Assignee 欄）
//   - 後續的看板、開發順序表等畫面共用同一組控件
//
// 三條硬規（沿用 design 端）：
//   1. 一切視覺值引用 token。尺寸與狀態色映射走 theme 的 componentTokens，
//      色彩經 useTheme 取當下 theme 求值，本組元件無 hex、無 raw number
//   2. 元件不收 theme 參數，一律 useTheme 自取，light / dark 都能用
//   3. 狀態齊備。互動元件備妥預設 / hover / focus / disabled；Select 另備 open、
//      Button 另備 loading、Checkbox 另備 checked 與 indeterminate
//
// focus 表達：可聚焦控件靜置外框吃 theme.border.input（3:1 必要邊界），
// 鍵盤聚焦時外加一圈 theme.state.focus.ring。ring 用 boxShadow 疊在外框外側，
// 不改變 layout 尺寸。ring 是否亮以 :focus-visible 判定，滑鼠點擊不亮——
// 此為 design 檔頭對 impl 的指定，與 canvas 的 onFocus 直亮不同。
//
// textStyle 與 useFocusVisible 為組內共用實作細節，不在對外介面上。

export { Button } from './Button';
export type { ButtonProps, ButtonSize } from './Button';

export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonSize } from './IconButton';

export { Select } from './Select';
export type { SelectOption, SelectProps, SelectSize } from './Select';

export { TextInput } from './TextInput';
export type { TextInputProps, TextInputSize } from './TextInput';

export { Checkbox } from './Checkbox';
export type { CheckboxProps, CheckboxSize } from './Checkbox';

export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { CONTROL_GLYPH_PATHS, ControlGlyph } from './ControlGlyph';
export type { ControlGlyphName, ControlGlyphProps } from './ControlGlyph';

export { avatarInitials } from './avatarInitials';
