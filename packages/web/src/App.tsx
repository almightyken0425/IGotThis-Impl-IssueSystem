// 應用根節點
//
// 只做兩件事：把整棵樹包進 ThemeProvider，再掛上路由。
// 版面與導覽在 AppShell、畫面在 screens/，本檔不承載任何視覺值。
//
// 主題選擇的持久化尚未接：ThemeProvider 收 initialThemeId 與 onThemeChange 兩個
// 接口，等使用者偏好設定落地後由此灌入與寫出。目前每次載入都從 light 起算。

import { RouterProvider } from 'react-router';

import { router } from './app/routes';
import { ThemeProvider } from './theme';

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
