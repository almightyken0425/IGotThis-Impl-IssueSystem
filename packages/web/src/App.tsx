// 應用根節點
//
// 只做兩件事：把整棵樹包進 ThemeProvider，再掛上路由。
// 版面與導覽在 AppShell、畫面在 screens/，本檔不承載任何視覺值。
//
// 主題選擇持久化在瀏覽器 localStorage：純視覺偏好，不跟帳號走、不跨裝置同步，
// 換裝置重選一次的成本低，不值得為此另開後端偏好設定的寫入路徑。
//
// 認證：AuthProvider 包在 router 之上，讓守衛與各畫面共讀同一份登入態。

import { RouterProvider } from 'react-router';

import { router } from './app/routes';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './theme';
import type { ThemeId } from './theme';

const THEME_STORAGE_KEY = 'igotthis_theme';

function readStoredThemeId(): ThemeId | undefined {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredThemeId(id: ThemeId): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // 寫入失敗（隱私模式、容量滿）不影響主題切換本身，靜默忽略。
  }
}

export function App() {
  const storedThemeId = readStoredThemeId();
  return (
    <ThemeProvider
      {...(storedThemeId === undefined ? {} : { initialThemeId: storedThemeId })}
      onThemeChange={writeStoredThemeId}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}
