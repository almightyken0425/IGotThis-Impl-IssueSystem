// Typography · 字體系統
//
// 來源：design git 的 `10_foundations/no2_typography.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 字級、字重、行高要變先在 design 定案，再回搬本檔。
//
// System font stack、基準 14px、資訊密度導向的緊湊階梯。
// TYPOGRAPHY 為底層數值階梯（size 與 weight），TYPE_STYLES 為語意層；
// 元件實際使用時優先採 TYPE_STYLES，少數情境才回退底層數值。

// ─── FONT_FAMILY ─────────────────────────────────────────────
// 桌面瀏覽器 system font stack。UI 一律 base；issue key、程式碼片段、diff 走 mono。

export const FONT_FAMILY = {
  base: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Segoe UI Mono', Menlo, Consolas, monospace",
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILY;

// ─── TYPOGRAPHY ──────────────────────────────────────────────
// size 階梯（px）：base 14 為工單列表與表單的預設字級，
// 階距收窄（10–24）換取高資訊密度；大字級只留 page 級標題用。
//
// weight：本設計標準啟用 regular / medium / semibold 三檔；
// bold 保留給極少數強調（如 kbd、危險操作確認），不進常規階梯。

export const TYPOGRAPHY = {
  size: { '2xs': 10, xs: 11, sm: 12, base: 14, lg: 16, xl: 18, '2xl': 20, '3xl': 24 },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export type FontSizeKey = keyof typeof TYPOGRAPHY.size;
export type FontWeightKey = keyof typeof TYPOGRAPHY.weight;
export type FontWeight = (typeof TYPOGRAPHY.weight)[FontWeightKey];

/** 本標準目前啟用的字重集合（驗證與文件用）。bold 不在列上。 */
export const TYPOGRAPHY_WEIGHT_ENABLED = ['regular', 'medium', 'semibold'] as const;

export type EnabledFontWeightKey = (typeof TYPOGRAPHY_WEIGHT_ENABLED)[number];

// ─── TYPE_STYLES ─────────────────────────────────────────────
// 語意層。每條含 size / weight / lineHeight / letterSpacing，lineHeight 為絕對 px。
// 緊湊階梯：body 14/20、表格 13/18，行高壓在 1.4 上下換密度。

export interface TypeStyle {
  readonly size: number;
  readonly weight: FontWeight;
  /** 絕對行高（px），非倍率。 */
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

export const TYPE_STYLES = {
  pageTitle: { size: 20, weight: TYPOGRAPHY.weight.semibold, lineHeight: 28, letterSpacing: -0.2 },
  sectionTitle: { size: 16, weight: TYPOGRAPHY.weight.semibold, lineHeight: 24, letterSpacing: -0.1 },
  cardTitle: { size: 14, weight: TYPOGRAPHY.weight.semibold, lineHeight: 20, letterSpacing: 0 },
  body: { size: 14, weight: TYPOGRAPHY.weight.regular, lineHeight: 20, letterSpacing: 0 },
  bodyMedium: { size: 14, weight: TYPOGRAPHY.weight.medium, lineHeight: 20, letterSpacing: 0 },
  bodySm: { size: 13, weight: TYPOGRAPHY.weight.regular, lineHeight: 18, letterSpacing: 0 },
  label: { size: 12, weight: TYPOGRAPHY.weight.medium, lineHeight: 16, letterSpacing: 0 },
  caption: { size: 11, weight: TYPOGRAPHY.weight.regular, lineHeight: 16, letterSpacing: 0.1 },
  /** 全大寫欄位標 / group 標 */
  overline: { size: 11, weight: TYPOGRAPHY.weight.medium, lineHeight: 16, letterSpacing: 0.6 },
  tableCell: { size: 13, weight: TYPOGRAPHY.weight.regular, lineHeight: 18, letterSpacing: 0 },
  /** 搭配 FONT_FAMILY.mono */
  code: { size: 13, weight: TYPOGRAPHY.weight.regular, lineHeight: 18, letterSpacing: 0 },
} as const satisfies Record<string, TypeStyle>;

export type TypeStyleName = keyof typeof TYPE_STYLES;

// ─── 自由排版用的比例階梯 ────────────────────────────────────
// TYPE_STYLES 內已內建絕對 lineHeight，下面兩組只給不走語意層的情境引用。

export const LINE_HEIGHT = { tight: 1.25, base: 1.45, relaxed: 1.6 } as const;

export const LETTER_SPACING = { tight: -0.2, normal: 0, wide: 0.6 } as const;

// ─── NUMERIC_FONT_VARIANT ────────────────────────────────────
// 數字等寬字形 token。表格數字、issue 計數、時間欄統一引用此值，
// 避免逐處 hardcode 造成遺漏（對應 CSS font-variant-numeric）。

export const NUMERIC_FONT_VARIANT = 'tabular-nums';
