// 甘特與導航組 · 內部小工具
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx` 檔內「內部小工具」段。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// 本檔不由 index.ts 對外匯出，只給同目錄的七個元件共用。函式名保留 design 端的
// `gantt` 前綴——design 是單檔 canvas、靠前綴避免撞名，impl 已有模組邊界不需要前綴，
// 但保留同名讓兩層逐字對照。

import type { CSSProperties } from 'react';

import type {
  Density,
  ElevationLevel,
  GanttColors,
  GanttDensityStep,
  Theme,
  TypeStyle,
} from '../../theme';
import { GANTT_TOKENS } from '../../theme';

import type { GanttDay } from './types';

/**
 * 密度檔位查表。design 端帶「查不到就退回預設」的守衛，impl 的 Density 是字面量
 * 聯集、查不到的鍵在編譯期就擋掉，故不再保留該守衛。
 */
export function ganttDensityOf(density: Density): GanttDensityStep {
  return GANTT_TOKENS.DENSITY[density];
}

/** TYPE_STYLES 的一條語意字級展成 inline style。lineHeight 是絕對 px，不是倍率。 */
export function ganttType(style: TypeStyle): CSSProperties {
  return {
    fontSize: style.size,
    fontWeight: style.weight,
    lineHeight: `${style.lineHeight}px`,
    letterSpacing: style.letterSpacing,
  };
}

/** theme 的 elevation 階 + shadow 色合成 box-shadow。level0 不投影。 */
export function ganttShadow(theme: Theme, level: ElevationLevel): string {
  const e = theme.shadow.elevation[level];
  if (e.opacity === 0) return 'none';
  const n = parseInt(theme.shadow.color.slice(1), 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  return `0 ${e.offsetY}px ${e.blur}px rgba(${rgb},${e.opacity})`;
}

/** focus 外框一律吃 colors.focusRing（= theme.border.input，兩主題保 3:1）。 */
export function ganttFocusStyle(colors: GanttColors, focused: boolean): CSSProperties {
  return focused
    ? {
        outline: `${GANTT_TOKENS.FOCUS_RING_WIDTH}px solid ${colors.focusRing}`,
        outlineOffset: GANTT_TOKENS.FOCUS_RING_OFFSET,
      }
    : { outline: 'none' };
}

/** 月份帶的一段。同月連續日併為一段，span 為天數。 */
export interface GanttMonthSegment {
  readonly label: string;
  readonly startIndex: number;
  span: number;
}

/** 把日陣列切成月份區段，供月份帶算寬與畫分隔。 */
export function ganttMonthSegments(days: readonly GanttDay[]): GanttMonthSegment[] {
  const segments: GanttMonthSegment[] = [];
  days.forEach((day, index) => {
    const last = segments[segments.length - 1];
    if (last === undefined || last.label !== day.monthLabel) {
      segments.push({ label: day.monthLabel, startIndex: index, span: 1 });
    } else {
      last.span += 1;
    }
  });
  return segments;
}
