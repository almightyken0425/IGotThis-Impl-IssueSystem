// typeStyle · TYPE_STYLES 的一條 → React inline style
//
// 來源：design git 的三個畫面檔各自帶的 LS_type / KS_type / devOrderType，
// 三者實作完全相同。搬進 impl 後合成一份，三個畫面共用。
//
// 為何不直接用元件組那份：controls/textStyle.ts 與 data/internal.tsx 的
// typeStyleCss 都是各組的內部實作細節、不在對外介面上，畫面層不穿透元件組內部檔。
//
// lineHeight 一律絕對 px；letterSpacing 留 raw number 交由 React 補 px，與 design 同。

import type { CSSProperties } from 'react';

import type { TypeStyle } from '../theme';

export function typeStyle(style: TypeStyle): CSSProperties {
  return {
    fontSize: style.size,
    fontWeight: style.weight,
    lineHeight: `${style.lineHeight}px`,
    letterSpacing: style.letterSpacing,
  };
}
