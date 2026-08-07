// textStyle · TYPE_STYLES 的一條 → React inline style
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，同名 helper。
//
// design 端與控件同檔；impl 拆出獨立檔，八個控件共用一份、不各自複寫。
// lineHeight 一律絕對 px；letterSpacing 留 raw number 交由 React 補 px，與 design 同。

import type { CSSProperties } from 'react';

import type { TypeStyle } from '../../theme';

export function textStyle(style: TypeStyle): CSSProperties {
  return {
    fontSize: style.size,
    fontWeight: style.weight,
    lineHeight: `${style.lineHeight}px`,
    letterSpacing: style.letterSpacing,
  };
}
