// 路由表 · 四個畫面各一條
//
// 單一真相：NAV_ITEMS 同時餵路由與側邊導覽列，兩處不各自維護一份清單。
// 加畫面就在 NAV_ITEMS 補一筆，導覽列自動長出對應項。
//
// 走 BrowserRouter 形態（createBrowserRouter）。正式期由單體伺服器託管 dist，
// 伺服器需對未命中的路徑回 index.html，深層網址直接開才不會 404。

import { createBrowserRouter, Navigate } from 'react-router';

import { RequireAuth } from '../auth/RequireAuth';
import { DevOrderScreen } from '../screens/DevOrderScreen';
import { IssueDetailScreen } from '../screens/IssueDetailScreen';
import { KanbanScreen } from '../screens/KanbanScreen';
import { ListScreen } from '../screens/ListScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { TypeDefinitionScreen } from '../screens/TypeDefinitionScreen';
import { AppShell } from './AppShell';

export interface NavItem {
  readonly path: string;
  readonly label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/list', label: '工單清單' },
  { path: '/kanban', label: '工單看板' },
  { path: '/dev-order', label: '開發順序表' },
  { path: '/types', label: '型別管理' },
];

const DEFAULT_PATH = '/list';

export const router = createBrowserRouter([
  // 登入頁在殼外、不設守衛，未登入者的落腳處。
  { path: '/login', element: <LoginScreen /> },
  // 其餘全掛認證守衛：未登入一律導向 /login。
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to={DEFAULT_PATH} replace /> },
          { path: 'list', element: <ListScreen /> },
          { path: 'kanban', element: <KanbanScreen /> },
          { path: 'dev-order', element: <DevOrderScreen /> },
          { path: 'types', element: <TypeDefinitionScreen /> },
          // 工單詳情頁：List/Kanban/DevOrder 三畫面點擊工單導覽至此，不掛側邊導覽列
          // （不進 NAV_ITEMS）——這是三畫面的下鑽頁，不是頂層導覽目的地。
          { path: 'issues/:issueId', element: <IssueDetailScreen /> },
          // 未知路徑退回預設檢視，不留白畫面。
          { path: '*', element: <Navigate to={DEFAULT_PATH} replace /> },
        ],
      },
    ],
  },
]);
