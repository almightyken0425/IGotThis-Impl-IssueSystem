// useFocusVisible · 只在鍵盤聚焦時亮 focus ring
//
// 來源：design git `no4_product_designs/no1_issue_system/` 的
// `project/20_components/no1_controls.jsx`，各控件內的 focus useState 段。
//
// design 端以 onFocus / onBlur 直接追蹤，滑鼠點擊也會亮 ring——該檔檔頭已註明那是
// sandbox 便於檢視的取捨、並要求 impl 改用 :focus-visible。inline style 表達不了
// 偽類，故在 onFocus 當下問一次 `:focus-visible` 是否成立，結果即為 ring 的開關。
//
// 回傳拆成 focusVisible 與 focusProps 兩截：focusProps 可整包展開到元素上，
// 不會把狀態旗標當成 DOM 屬性漏出去。

import { useCallback, useMemo, useState } from 'react';
import type { FocusEvent } from 'react';

export interface FocusVisibleBinding<E extends Element> {
  /** true 才畫 ring。 */
  readonly focusVisible: boolean;
  readonly focusProps: {
    readonly onFocus: (event: FocusEvent<E>) => void;
    readonly onBlur: () => void;
  };
}

/** 舊瀏覽器不認 :focus-visible 時退回「有焦點就算」，寧可多亮不可不亮。 */
function matchesFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

export function useFocusVisible<E extends Element>(): FocusVisibleBinding<E> {
  const [focusVisible, setFocusVisible] = useState(false);

  const onFocus = useCallback((event: FocusEvent<E>) => {
    setFocusVisible(matchesFocusVisible(event.currentTarget));
  }, []);

  const onBlur = useCallback(() => {
    setFocusVisible(false);
  }, []);

  return useMemo(
    () => ({ focusVisible, focusProps: { onFocus, onBlur } }),
    [focusVisible, onFocus, onBlur],
  );
}
