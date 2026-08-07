// 認證狀態 · 全域帳號態與登入 / 登出動作
//
// 角色：把「當前是誰、是否登入中」收斂成單一 context，守衛與畫面共讀。
// 啟動：掛載時打 /api/auth/me 探當前 session；有效即帶出帳號，無效回未登入。
// 失效聯動：client 於任何 401 派發 UNAUTHORIZED_EVENT，本層監聽後清空帳號，
//           守衛隨即把使用者導回登入頁——涵蓋 session 於瀏覽途中過期的情形。

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { authApi, UNAUTHORIZED_EVENT } from '../api';
import type { Account, LoginInput, RegisterInput } from '../api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly account: Account | null;
  readonly login: (input: LoginInput) => Promise<void>;
  readonly register: (input: RegisterInput) => Promise<void>;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // 啟動探測：問 /me 決定初始登入態。401 由 client 轉為未登入路徑。
  useEffect(() => {
    let alive = true;
    void authApi
      .me()
      .then((acc) => {
        if (alive) {
          setAccount(acc);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (alive) {
          setAccount(null);
          setStatus('anonymous');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  // 全域失效聯動：任何請求碰到 401 就清空帳號態。
  useEffect(() => {
    const onUnauthorized = () => {
      setAccount(null);
      setStatus('anonymous');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const acc = await authApi.login(input);
    setAccount(acc);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const acc = await authApi.register(input);
    setAccount(acc);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setAccount(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, account, login, register, logout }),
    [status, account, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth 必須在 AuthProvider 之內使用');
  }
  return ctx;
}
