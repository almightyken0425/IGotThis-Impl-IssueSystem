// 當前檢視狀態 · 跨畫面共用的檢視選擇
//
// 角色：管理當前帳號名下的檢視清單與「當前選中哪一張」，供 AppShell 的
// 選擇器 / 新增檢視使用；下一輪三個畫面改接 /api/views/:id/issues 時，
// 直接從這裡讀 currentView，不必再改路由或殼層結構。
//
// 不持久化：純 React state，重整頁面回到「清單非空即自動選第一張」——
// Accounts 資料模型沒有 currentViewId 欄位，這輪不加後端狀態；
// 「有檢視但尚未選」不是 design 定案的狀態，維持這個最簡規則。

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { viewsApi } from '../api';
import type { CreateViewInput, View } from '../api';
import { useAsync } from '../hooks/useAsync';

interface CurrentViewContextValue {
  readonly views: readonly View[];
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly currentView: View | null;
  readonly selectView: (id: string) => void;
  readonly addView: (input: CreateViewInput) => Promise<void>;
  /** 首次載入失敗時重試；成功後與「真的沒有檢視」在畫面上才不會顯示成同一種空狀態。 */
  readonly retry: () => void;
}

const CurrentViewContext = createContext<CurrentViewContextValue | undefined>(undefined);

export function CurrentViewProvider({ children }: { readonly children: ReactNode }) {
  const fetcher = useCallback(() => viewsApi.listMyViews(), []);
  const { data, loading, error, reload } = useAsync(fetcher);

  const [currentViewId, setCurrentViewId] = useState<string | null>(null);
  // 剛建立、伺服器清單可能還沒反映的檢視：先在本地補上一筆，避免緊接著的
  // reload（可能失敗，useAsync 的錯誤只落在 error state、不會 reject）沒帶回
  // 這筆新資料時，被下面的自動選擇邏輯誤判成「當前選定不在清單內」而覆蓋掉。
  const [pendingView, setPendingView] = useState<View | null>(null);

  const views = useMemo<readonly View[]>(() => {
    const base = data ?? [];
    if (pendingView !== null && !base.some((v) => v.id === pendingView.id)) {
      return [...base, pendingView];
    }
    return base;
  }, [data, pendingView]);

  // pendingView 真的出現在伺服器清單後，本地補的那筆就沒用了，清掉避免疊加。
  useEffect(() => {
    if (pendingView !== null && data !== undefined && data.some((v) => v.id === pendingView.id)) {
      setPendingView(null);
    }
  }, [data, pendingView]);

  // 清單載入完成、當前選定不在清單內（含尚未選定過）時，自動選第一張；
  // 清單為空則維持 null，不自動建立檢視（spec：無檢視可選，內容為空）。
  useEffect(() => {
    if (data === undefined) return;
    if (currentViewId !== null && views.some((v) => v.id === currentViewId)) return;
    setCurrentViewId(views.length > 0 ? views[0]!.id : null);
  }, [data, views, currentViewId]);

  const addView = useCallback(
    async (input: CreateViewInput) => {
      const created = await viewsApi.createView(input);
      setPendingView(created);
      setCurrentViewId(created.id);
      await reload();
    },
    [reload],
  );

  const currentView = views.find((v) => v.id === currentViewId) ?? null;

  const value: CurrentViewContextValue = {
    views,
    loading,
    error,
    currentView,
    selectView: setCurrentViewId,
    addView,
    retry: () => void reload(),
  };

  return <CurrentViewContext.Provider value={value}>{children}</CurrentViewContext.Provider>;
}

export function useCurrentView(): CurrentViewContextValue {
  const ctx = useContext(CurrentViewContext);
  if (ctx === undefined) {
    throw new Error('useCurrentView 必須在 CurrentViewProvider 之內使用');
  }
  return ctx;
}
