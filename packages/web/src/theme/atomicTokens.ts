// Atomic tokens · 色彩 / 主題 / 陰影
//
// 來源：design git 的 `10_foundations/no1_atomic_tokens.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
// 取值要變先在 design 定案，再回搬本檔；本檔不得單獨調數值或新增色階。
// export 名稱與 design 逐名相同，兩層對照零翻譯成本。
//
// 色彩方向採 L · Pine Paper 深林紙感：主色種子 #004643 落 pine 800、
// 底色種子 #F0EDE5 落 sand 100。光暗雙主題共用 PALETTE 與 SHADOW_ELEVATION，
// light 為預設。design 端的 TOKENS 為 canvas 渲染快照，impl 不對齊、故不搬。

// ─── 色階的階位型別 ───────────────────────────────────────────

export type SandStep = 0 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 | 1000;
export type PineStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type SandScale = { readonly [K in SandStep]: string };
export type PineScale = { readonly [K in PineStep]: string };

export type SemanticName = 'success' | 'warning' | 'error' | 'info';
export type SemanticScale = { readonly [K in SemanticName]: string };

export type ThemeId = 'light' | 'dark';
export type ElevationLevel = 'level0' | 'level1' | 'level2' | 'level3';

// ─── PALETTE ─────────────────────────────────────────────────
// sand 暖中性階：色相全程鎖 43° 暖米，飽和度中段最低降到 12–15%、
// 最深的文字階回升到 19–21%，避免深階退回中性灰、暖調斷掉。
// 0 為抬起的紙面（取代冷系的純白）、100 為畫布底、950 與 1000 供暗主題與陰影。
//
// semantic 四色為 light theme 的 status 主色基準（dark 在 THEME_DARK 內提亮）。
// 這四色只承載色彩身份；badge 文字另走 status.<name>_fg 深階，見 THEME_LIGHT.status。

export const PALETTE = {
  sand: {
    0: '#FBF9F4',
    50: '#F6F4EF',
    100: '#F0EDE5',
    200: '#E5E1D7',
    300: '#D3CEC0',
    400: '#9F9783',
    500: '#89816C',
    600: '#6B6452',
    700: '#514C3D',
    800: '#393428',
    900: '#252118',
    950: '#17140E',
    1000: '#0A0806',
  },
  semantic: {
    success: '#16A34A',
    warning: '#D97706',
    error: '#DC2626',
    info: '#0284C7',
  },
} as const satisfies { readonly sand: SandScale; readonly semantic: SemanticScale };

// ─── PRIMARY_PINE ────────────────────────────────────────────
// 主色 pine 十階，種子 #004643 落 800、色相鎖 177°。
// main 取值由各 theme 決定（light 取 800 保 AA 對比、dark 取 400 提亮）。
// 800 亮度僅 14%，直接承按鈕、對白字 10.73:1；50–400 淺階刻意拉開飽和與亮度差，
// 讓 50 選取底不糊、700 承 key 與選取邊線不糊成黑。

export const PRIMARY_PINE = {
  50: '#F0F9F8',
  100: '#DFF1F0',
  200: '#C0E3E1',
  300: '#98CDCB',
  400: '#65B3B1',
  500: '#359794',
  600: '#1F7A77',
  700: '#0B605D',
  800: '#004643',
  900: '#002E2C',
} as const satisfies PineScale;

// ─── SHADOW_ELEVATION ────────────────────────────────────────
// 雙主題共享的陰影三階（offsetY / blur / opacity，color 由 theme.shadow.color 引用）。
// level0 為「無陰影」placeholder。桌面工具陰影節制：
// level1 卡片、level2 dropdown / popover、level3 modal。
// 陰影色吃 sand 深階而非中性黑，疊透明度後仍保暖調、不在紙面上壓出灰霧。

export interface ShadowElevationStep {
  readonly offsetY: number;
  readonly blur: number;
  readonly opacity: number;
}

export type ShadowElevation = { readonly [K in ElevationLevel]: ShadowElevationStep };

export const SHADOW_ELEVATION = {
  level0: { offsetY: 0, blur: 0, opacity: 0 },
  level1: { offsetY: 1, blur: 2, opacity: 0.06 },
  level2: { offsetY: 4, blur: 12, opacity: 0.1 },
  level3: { offsetY: 12, blur: 32, opacity: 0.18 },
} as const satisfies ShadowElevation;

// ─── Theme 型別 ──────────────────────────────────────────────
// 兩個主題共用同一份型別，消費端因此不必分支 theme.id 就能讀任一鍵。
// 需要分支的只有「同色系推一階」這類方向相反的 hover，分支寫在 component token 的
// resolver 內，不外洩到元件。

export interface ThemeBg {
  /** app 底：工作區外框、page 背景 */
  readonly base: string;
  /** 卡片 / 表格 / panel 底，抬起的紙面 */
  readonly surface: string;
  /** row hover 底 */
  readonly surface_hover: string;
  /** 比 surface 淡一階的子區塊底（toolbar、table header） */
  readonly surface_dim: string;
}

/** 三階文字全數承 WCAG 1.4.3 的 4.5:1——placeholder、時間戳、meta 都算文字，沒有豁免。 */
export interface ThemeText {
  readonly primary: string;
  readonly secondary: string;
  /** meta 資訊、placeholder、時間戳 */
  readonly tertiary: string;
}

/**
 * border 三鍵依「是不是必要 UI 元件邊界」分流，1.4.11 的 3:1 只約束 input。
 * 消費端不得以 strong 代 input；strong 只是更重的裝飾線、不保證 3:1。
 */
export interface ThemeBorder {
  /** 裝飾性：卡片外框、表格細線 */
  readonly base: string;
  /** 裝飾性加重：分區邊、hover 態容器邊 */
  readonly strong: string;
  /** 必要邊界：輸入框、select、textarea、checkbox 等可聚焦控件外框 */
  readonly input: string;
}

export interface ThemeDivider {
  readonly base: string;
  /** 表格 row 分隔等最細分隔線 */
  readonly hairline: string;
}

/**
 * pine 十階加上 main 與 on_main。
 * on_main 為疊在 main 上的前景色；消費端一律讀此鍵、不 hardcode 白字——
 * dark 的 main 取 pine[400] 是亮色，白字只有 2.43:1。
 */
export type ThemePrimary = PineScale & {
  readonly main: string;
  readonly on_main: string;
};

/**
 * status 三件套：`<name>` 為色彩身份（圖示、圓點、邊線），
 * `<name>_bg` 為 badge 與 callout 淡底，`<name>_fg` 為疊在 _bg 上的文字色。
 *
 * 為何拆出 _fg：暖紙底把 badge 淡底一併推暖，semantic 基準色壓在自家淡底上只剩
 * 2.67–3.83:1，四色全數落在 AA 之下。修法不動基準值，改由 _bg 換成同色 12% 暖淡底、
 * _fg 換成同色系深兩階文字色，實測四色 5.94–6.58 全過 AA。
 * badge 文字只吃 _fg；基準色留給圓點與圖示等非文字元素。
 */
export interface ThemeStatus {
  readonly success: string;
  readonly success_bg: string;
  readonly success_fg: string;
  readonly warning: string;
  readonly warning_bg: string;
  readonly warning_fg: string;
  readonly error: string;
  readonly error_bg: string;
  readonly error_fg: string;
  readonly info: string;
  readonly info_bg: string;
  readonly info_fg: string;
}

export interface ThemeState {
  readonly hover: { readonly bg: string };
  readonly selected: {
    readonly bg: string;
    readonly fg: string;
    readonly border: string;
  };
  /** 停用元件不受 1.4.3 與 1.4.11 約束，故 fg 容許低於 4.5:1。 */
  readonly disabled: { readonly fg: string; readonly opacity: number };
  readonly focus: { readonly ring: string; readonly ringWidth: number };
}

export interface ThemeShadow {
  readonly color: string;
  readonly elevation: ShadowElevation;
}

export interface Theme {
  readonly id: ThemeId;
  readonly name: string;
  readonly bg: ThemeBg;
  readonly text: ThemeText;
  readonly border: ThemeBorder;
  readonly divider: ThemeDivider;
  readonly primary: ThemePrimary;
  readonly status: ThemeStatus;
  readonly state: ThemeState;
  readonly shadow: ThemeShadow;
}

// ─── THEME_LIGHT ─────────────────────────────────────────────

export const THEME_LIGHT: Theme = {
  id: 'light',
  name: 'Light（預設）',
  bg: {
    base: PALETTE.sand[100], // 紙感畫布底 #F0EDE5
    surface: PALETTE.sand[0], // 抬起的紙面 #FBF9F4
    surface_hover: PALETTE.sand[50],
    surface_dim: 'rgba(37,33,24,0.04)', // 暖墨疊透明度
  },
  // tertiary 由 sand[400] 下探到 sand[600]、secondary 推深到 sand[700]，
  // L* 12.9 / 32.4 / 42.5，三階都過 4.5:1。
  text: {
    primary: PALETTE.sand[900], // 對紙面 15.24:1、對畫布底 13.71:1
    secondary: PALETTE.sand[700], // 對紙面 8.14:1、對畫布底 7.32:1
    tertiary: PALETTE.sand[600], // 對紙面 5.59:1、對畫布底 5.03:1
  },
  border: {
    base: PALETTE.sand[200], // 對紙面 1.24:1
    strong: PALETTE.sand[300], // 對紙面 1.49:1
    input: PALETTE.sand[500], // 對紙面 3.68:1、對畫布底 3.31:1，兩底都過 3:1
  },
  divider: {
    base: PALETTE.sand[200],
    hairline: 'rgba(37,33,24,0.08)',
  },
  primary: { main: PRIMARY_PINE[800], on_main: '#FFFFFF', ...PRIMARY_PINE }, // 白字對 pine[800] 10.73:1
  status: {
    success: PALETTE.semantic.success,
    success_bg: '#E0EFE0',
    success_fg: '#166534',
    warning: PALETTE.semantic.warning,
    warning_bg: '#F7E9D7',
    warning_fg: '#92400E',
    error: PALETTE.semantic.error,
    error_bg: '#F7E0DB',
    error_fg: '#991B1B',
    info: PALETTE.semantic.info,
    info_bg: '#DDEBEF',
    info_fg: '#075985',
  },
  state: {
    hover: { bg: PALETTE.sand[50] },
    // 選取態：50 淡底 + 800 文字（10.02:1）+ 700 邊線，邊線比 main 淺一階、不糊成黑。
    selected: { bg: PRIMARY_PINE[50], fg: PRIMARY_PINE[800], border: PRIMARY_PINE[700] },
    disabled: { fg: PALETTE.sand[400], opacity: 0.45 },
    focus: { ring: PRIMARY_PINE[700], ringWidth: 2 },
  },
  shadow: { color: PALETTE.sand[900], elevation: SHADOW_ELEVATION },
};

// ─── THEME_DARK ──────────────────────────────────────────────

export const THEME_DARK: Theme = {
  id: 'dark',
  name: 'Dark',
  bg: {
    base: PALETTE.sand[950],
    surface: PALETTE.sand[900],
    surface_hover: PALETTE.sand[800],
    surface_dim: 'rgba(251,249,244,0.04)', // 暖白疊透明度
  },
  // 與 light 鏡像：L* 93.8 / 82.8 / 62.6，對 surface 與對 base 兩底都過 4.5:1。
  text: {
    primary: PALETTE.sand[100], // 對 surface 13.71:1、對 base 15.71:1
    secondary: PALETTE.sand[300], // 對 surface 10.20:1、對 base 11.69:1
    tertiary: PALETTE.sand[400], // 對 surface 5.52:1、對 base 6.33:1
  },
  border: {
    base: PALETTE.sand[800], // 對 surface 1.30:1
    strong: PALETTE.sand[700], // 對 surface 1.87:1
    input: PALETTE.sand[500], // 對 surface 4.14:1、對 base 4.74:1
  },
  divider: {
    base: PALETTE.sand[800],
    hairline: 'rgba(159,151,131,0.14)', // sand[400] 疊透明度，暗底細線不轉冷灰
  },
  // 暗底主色取 pine[400]：對 surface 6.60:1、對 base 7.56:1；
  // on_main 改吃 sand[1000] 深墨，對亮主色 8.22:1。
  primary: { main: PRIMARY_PINE[400], on_main: PALETTE.sand[1000], ...PRIMARY_PINE },
  // semantic 前景整體提亮一階、_bg 為同色 12% 疊在 surface 上的暖深淡底；
  // _fg 與提亮後的 <name> 同值，badge 消費端在雙主題吃同一組鍵。
  status: {
    success: '#4ADE80',
    success_bg: '#293824',
    success_fg: '#4ADE80',
    warning: '#FBBF24',
    warning_bg: '#3F3419',
    warning_fg: '#FBBF24',
    error: '#F87171',
    error_bg: '#3E2B23',
    error_fg: '#F87171',
    info: '#38BDF8',
    info_bg: '#273433',
    info_fg: '#38BDF8',
  },
  state: {
    hover: { bg: PALETTE.sand[800] },
    // 選取底為 pine[400] 疊 10%。alpha 由 16% 降到 10% 是對比預算逼出來的：
    // 16% 時疊在選取列上的 text.tertiary 只剩 4.16:1、status.error_fg 4.37:1，
    // 降到 10% 後兩者回到 4.66 與 4.90，selected.fg 也從 6.90 升到 7.69。
    // 選取感另有 2px 左側 accent 條與 border 撐，不靠這層底獨撐。
    selected: { bg: 'rgba(101,179,177,0.10)', fg: PRIMARY_PINE[300], border: PRIMARY_PINE[400] },
    disabled: { fg: PALETTE.sand[600], opacity: 0.45 },
    focus: { ring: PRIMARY_PINE[400], ringWidth: 2 },
  },
  shadow: { color: PALETTE.sand[1000], elevation: SHADOW_ELEVATION },
};

// ─── 主題註冊表 ──────────────────────────────────────────────

export const THEMES: { readonly [K in ThemeId]: Theme } = {
  light: THEME_LIGHT,
  dark: THEME_DARK,
};

export const DEFAULT_THEME_ID: ThemeId = 'light';

export const DEFAULT_THEME: Theme = THEMES[DEFAULT_THEME_ID];
