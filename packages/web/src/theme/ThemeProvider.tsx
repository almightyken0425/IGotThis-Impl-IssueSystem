// 主題切換機制 · impl 專屬
//
// 對應 design git `10_foundations/no1_atomic_tokens.jsx` 的雙主題定案：
// THEMES 兩筆、light 為預設。design 端 canvas 自帶切換件，impl 這層是等價的 React 實作，
// 不新增任何 token；只決定「當下拿哪一份 Theme 物件」。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// 設計取捨：
//   - 單一 context 供整棵樹讀，元件只拿 theme 物件、不自己判斷 themeId
//   - theme.id 分支收在 component token 的 resolver 內，元件層不出現主題分支
//   - provider 只管記憶體內的當下主題；要記住使用者選擇由外層決定，
//     透過 initialThemeId 灌入、以 setThemeId 的回呼寫出去
//   - 掛載與切換時同步寫 <html data-theme> 與 color-scheme，
//     讓捲軸與原生表單控件跟著暗，並供 CSS 選擇器掛鉤

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { Theme, ThemeId } from './atomicTokens';
import { DEFAULT_THEME_ID, THEMES } from './atomicTokens';

export interface ThemeContextValue {
  /** 當下主題物件，元件一律讀這份。 */
  readonly theme: Theme;
  readonly themeId: ThemeId;
  readonly setThemeId: (id: ThemeId) => void;
  /** light 與 dark 對切。 */
  readonly toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  /** 省略即 light。要接續使用者上次的選擇，由外層讀出後灌進來。 */
  readonly initialThemeId?: ThemeId;
  /** 主題變更時的通知，供外層做持久化。 */
  readonly onThemeChange?: (id: ThemeId) => void;
  readonly children: ReactNode;
}

export function ThemeProvider({
  initialThemeId = DEFAULT_THEME_ID,
  onThemeChange,
  children,
}: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<ThemeId>(initialThemeId);

  const setThemeId = useCallback(
    (id: ThemeId) => {
      setThemeIdState(id);
      onThemeChange?.(id);
    },
    [onThemeChange],
  );

  const toggleTheme = useCallback(() => {
    setThemeId(themeId === 'dark' ? 'light' : 'dark');
  }, [setThemeId, themeId]);

  // 原生 UI（捲軸、日期選擇器、autofill 底色）吃 color-scheme，不吃我們的 token；
  // data-theme 則給不走 inline style 的 CSS 掛鉤。
  useEffect(() => {
    const root = document.documentElement;
    root.dataset['theme'] = themeId;
    root.style.colorScheme = themeId;
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: THEMES[themeId], themeId, setThemeId, toggleTheme }),
    [themeId, setThemeId, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * 取當下主題與切換手段。
 * 沒有上層 ThemeProvider 就丟錯——靜默退回 light 會讓漏包的子樹在暗主題下錯得無聲。
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme 必須在 ThemeProvider 之內呼叫');
  }
  return ctx;
}
