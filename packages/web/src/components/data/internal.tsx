// 資料展示組 · 內部工具
//
// 來源：design git 的 `20_components/no2_data_display.jsx`（`DD_` 前綴的內部工具段）。
//
// design 端整份掛 window、靠 `DD_` 前綴避開全域撞名；impl 走模組作用域，
// 前綴不再需要，本檔也不經 index.ts 對外匯出，只供同目錄元件引用。
//
// Badge 與 Avatar 的差異：design 端優先吃 `window.Badge` / `window.Avatar`、
// 未載入才走 fallback。impl 沒有全域註冊表，控件組（controlTokens 的消費端）
// 也還沒搬進來，所以這裡只留等價實作，幾何鏡射 BADGE_TOKENS / AVATAR_TOKENS。
// 控件組落地後，本檔兩個 slot 換成 import 真正的 Badge / Avatar 即可，
// 元件層的呼叫端不動。

import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import {
  BADGE_TOKENS,
  DATA_DISPLAY_TOKENS,
  RADIUS,
  TYPOGRAPHY,
} from '../../theme';
import type { ShadowElevationStep, Theme, TypeStyle } from '../../theme';
import type { StatusTone } from './types';

// ─── 樣式組裝 ────────────────────────────────────────────────

/** TypeStyle 攤成 CSS 四鍵；lineHeight 是絕對 px、不是倍率。 */
export function typeStyleCss(style: TypeStyle, extra?: CSSProperties): CSSProperties {
  return {
    fontSize: style.size,
    fontWeight: style.weight,
    lineHeight: `${style.lineHeight}px`,
    letterSpacing: style.letterSpacing,
    ...extra,
  };
}

function hexToRgbChannels(hex: string): string {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)).join(',');
}

/** elevation 三階轉 box-shadow；陰影色讀 theme.shadow.color 的 sand 暖深階。 */
export function elevationShadow(shadowColor: string, level: ShadowElevationStep): string {
  if (level.offsetY === 0 && level.blur === 0) return 'none';
  return `0 ${level.offsetY}px ${level.blur}px 0 rgba(${hexToRgbChannels(shadowColor)},${level.opacity})`;
}

/** focus 視覺的單一出口：outline 吃 focus ring、元件外框轉必要邊界色。 */
export interface FocusColors {
  readonly focusRing: string;
  readonly focusBorder: string;
}

export function focusStyleCss(colors: FocusColors, width: number, offset: number): CSSProperties {
  return {
    outline: `${width}px solid ${colors.focusRing}`,
    outlineOffset: offset,
    borderColor: colors.focusBorder,
  };
}

export function alignToJustify(align: CellAlignInput): CSSProperties['justifyContent'] {
  if (align === 'right') return 'flex-end';
  if (align === 'center') return 'center';
  return 'flex-start';
}

type CellAlignInput = 'left' | 'center' | 'right' | undefined;

// ─── Glyph ───────────────────────────────────────────────────
// canvas 自製線稿，16 格線盤、筆畫吃 GLYPH_STROKE。

export type GlyphName = 'sort-asc' | 'sort-desc' | 'sort-none' | 'funnel' | 'inbox' | 'clock' | 'plus';

export interface GlyphProps {
  readonly name: GlyphName;
  readonly size: number;
  readonly color: string;
  readonly style?: CSSProperties | undefined;
}

function glyphShape(name: GlyphName): ReactNode {
  switch (name) {
    case 'sort-asc':
      return <path d="M8 12.5V3.5M4.5 7L8 3.5 11.5 7" />;
    case 'sort-desc':
      return <path d="M8 3.5v9M4.5 9l3.5 3.5L11.5 9" />;
    case 'sort-none':
      return <path d="M5 6.5L8 3.5l3 3M5 9.5l3 3 3-3" />;
    case 'funnel':
      return <path d="M2.5 3.5h11L9.3 8.4v4.1l-2.6 1.2V8.4z" />;
    case 'inbox':
      return <path d="M2.5 9.5h3l1 2h3l1-2h3M2.5 9.5l1.6-6h7.8l1.6 6v3h-11z" />;
    case 'clock':
      return (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 5v3.2l2 1.3" />
        </>
      );
    case 'plus':
      return <path d="M8 3.5v9M3.5 8h9" />;
  }
}

export function Glyph({ name, size, color, style }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={DATA_DISPLAY_TOKENS.GLYPH_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      {glyphShape(name)}
    </svg>
  );
}

// ─── 截斷 ────────────────────────────────────────────────────

export interface TruncateProps {
  readonly title?: string | undefined;
  readonly children: ReactNode;
}

export function Truncate({ title, children }: TruncateProps) {
  return (
    <span
      title={title}
      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {children}
    </span>
  );
}

// ─── Badge slot ──────────────────────────────────────────────

export interface BadgeGeometry {
  readonly height: number;
  readonly radius: number;
  readonly paddingX: number;
  readonly typeStyle: TypeStyle;
  /** 表格密度高時留圓點作形狀線索；看板卡橫向窄，關掉。 */
  readonly dot: boolean;
}

export interface BadgeSlotProps {
  readonly theme: Theme;
  readonly label: string;
  readonly geometry: BadgeGeometry;
  readonly tone?: StatusTone | undefined;
  /** tone 缺席時的中性配色，由各家族的色彩 resolver 提供。 */
  readonly neutralBg: string;
  readonly neutralFg: string;
}

function statusPair(theme: Theme, tone: StatusTone): { readonly bg: string; readonly fg: string } {
  switch (tone) {
    case 'success':
      return { bg: theme.status.success_bg, fg: theme.status.success_fg };
    case 'warning':
      return { bg: theme.status.warning_bg, fg: theme.status.warning_fg };
    case 'error':
      return { bg: theme.status.error_bg, fg: theme.status.error_fg };
    case 'info':
      return { bg: theme.status.info_bg, fg: theme.status.info_fg };
  }
}

export function BadgeSlot({ theme, label, geometry, tone, neutralBg, neutralFg }: BadgeSlotProps) {
  const pair = tone === undefined ? { bg: neutralBg, fg: neutralFg } : statusPair(theme, tone);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: BADGE_TOKENS.GAP,
        maxWidth: '100%',
        height: geometry.height,
        padding: `0 ${geometry.paddingX}px`,
        borderRadius: geometry.radius,
        background: pair.bg,
        color: pair.fg,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...typeStyleCss(geometry.typeStyle),
      }}
    >
      {geometry.dot && (
        // 圓點與文字同吃 fg，理由見 controlTokens 的 BADGE_TOKENS.COLORS_BY_TONE 註解。
        <span
          style={{
            width: BADGE_TOKENS.DOT_SIZE,
            height: BADGE_TOKENS.DOT_SIZE,
            borderRadius: RADIUS.full,
            background: pair.fg,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}

// ─── Avatar slot ─────────────────────────────────────────────

export interface AvatarSlotProps {
  readonly name: string;
  readonly size: number;
  readonly bg: string;
  readonly fg: string;
  readonly typeStyle: TypeStyle;
}

/** 中日文取末一字（姓名慣例），拉丁字母取首字母。 */
export function nameInitial(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return '?';
  return /[㐀-鿿]/.test(trimmed) ? trimmed.slice(-1) : trimmed.slice(0, 1).toUpperCase();
}

export function AvatarSlot({ name, size, bg, fg, typeStyle }: AvatarSlotProps) {
  return (
    <span
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.full,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color: fg,
        ...typeStyleCss(typeStyle, {
          lineHeight: `${size}px`,
          fontWeight: TYPOGRAPHY.weight.medium,
        }),
      }}
    >
      {nameInitial(name)}
    </span>
  );
}

// ─── spinner keyframes ───────────────────────────────────────
// inline style 表達不了 keyframes，只能往 document 塞一次；id 當去重鍵。

const SPIN_KEYFRAMES_ID = 'igt-data-display-keyframes';

export const SPIN_ANIMATION_NAME = 'igtDataDisplaySpin';

export function useSpinKeyframes(): void {
  useEffect(() => {
    if (document.getElementById(SPIN_KEYFRAMES_ID) !== null) return;
    const el = document.createElement('style');
    el.id = SPIN_KEYFRAMES_ID;
    el.textContent = `@keyframes ${SPIN_ANIMATION_NAME} { to { transform: rotate(360deg) } }`;
    document.head.appendChild(el);
  }, []);
}
