// 認證守衛 · 未登入導向登入頁
//
// 掛在受保護路由外層。載入探測期顯示過場，未登入 Navigate 到 /login，
// 已登入才渲染子路由出口。

import { Navigate, Outlet } from 'react-router';

import { FONT_FAMILY, TYPE_STYLES, useTheme } from '../theme';
import { typeStyle } from '../screens/typeStyle';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { status } = useAuth();
  const { theme } = useTheme();

  if (status === 'loading') {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.bg.base,
          color: theme.text.tertiary,
          fontFamily: FONT_FAMILY.base,
          ...typeStyle(TYPE_STYLES.bodySm),
        }}
      >
        載入中…
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
