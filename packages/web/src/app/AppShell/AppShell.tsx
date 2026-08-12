// AppShell · 應用外殼
//
// 側邊四段：品牌、當前檢視、畫面形態導覽、帳號；右側是路由出口。
//
// 來源：design git 的 `30_screens/no4_app_shell/no4_app_shell.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no4_app_shell.md
//   佈局四段與互動五條逐條對位。
//
// 已知落差（這輪刻意保留，下一輪三個畫面改接當前檢視時再處理）：
// - spec 的 selectCurrentView（ViewLogic）要求選了檢視後資料來源／篩選／欄位顯示
//   設定／排序值都跟著切換，這輪完全沒有實作——CurrentViewContext 目前只是一個
//   本地 React state（currentViewId），選擇動作不連動任何資料。「切換畫面形態時
//   當前檢視不變」是這個架構自然的副作用（Provider 掛在 AppShell、不因路由換頁
//   重新掛載），不是因為落地了 selectCurrentView 規則。
// - 內容區不比照 design 在無檢視時切 EmptyState，維持無條件 <Outlet/>——這輪之前
//   系統完全沒有建立 View 的入口，代表現在每個帳號名下的檢視清單必然是空的；若照
//   design 機械式加上「無檢視擋內容區」，會讓現行三個可用畫面直接消失，是比「選了
//   檢視畫面沒反應」嚴重得多的真倒退。
// - 選了當前檢視後，三個工作畫面的內容不會跟著變（它們仍呼叫 workspaceApi，未改接
//   /api/views/:id/issues），不加補償性提示——這是已核准的分階段限制，不是缺陷。
// - 新增檢視表單（AddViewForm）為 design 尚無定案的欄位細節，impl 補最小可用形。
//
// 主題切換：ThemeProvider 在更上層（App.tsx），本檔只提供切換入口。

import { NavLink, Outlet } from 'react-router';
import { useState } from 'react';

import { useAuth } from '../../auth/AuthContext';
import { Button, Select } from '../../components/controls';
import {
  BORDER_WIDTH,
  CONTROL_HEIGHT,
  FONT_FAMILY,
  MOTION,
  RADIUS,
  SPACING,
  TYPE_STYLES,
  useTheme,
} from '../../theme';
import type { Theme } from '../../theme';
import { typeStyle } from '../../screens/typeStyle';
import { CurrentViewProvider, useCurrentView } from '../CurrentViewContext';
import { NAV_ITEMS } from '../routes';
import { AddViewForm } from './AddViewForm';

const SHELL_TOKENS = {
  SIDEBAR_WIDTH: SPACING['3xl'] * 5, // 200
  SIDEBAR_PADDING: SPACING.md,
  SIDEBAR_GAP: SPACING.lg,
  SIDEBAR_BORDER_WIDTH: BORDER_WIDTH.hairline,

  BRAND_TYPE: TYPE_STYLES.sectionTitle,
  BRAND_META_TYPE: TYPE_STYLES.caption,
  BRAND_GAP: SPACING['2xs'],

  GROUP_GAP: SPACING.sm,

  NAV_GAP: SPACING['2xs'],
  NAV_GROUP_TYPE: TYPE_STYLES.overline,
  NAV_ITEM_HEIGHT: CONTROL_HEIGHT.lg, // 32
  NAV_ITEM_PADDING_X: SPACING.sm,
  NAV_ITEM_GAP: SPACING.sm,
  NAV_ITEM_RADIUS: RADIUS.sm,
  NAV_ITEM_TYPE: TYPE_STYLES.bodySm,
  /** 選取態的左側指示條，與表格選取列同一個語彙。 */
  NAV_ACCENT_WIDTH: BORDER_WIDTH.focus,
  NAV_ACCENT_HEIGHT: SPACING.lg, // 16

  TRANSITION_MS: MOTION.duration.instant,
  TRANSITION_EASING: MOTION.easing.standard,
} as const;

const S = SHELL_TOKENS;

interface NavItemProps {
  readonly theme: Theme;
  readonly to: string;
  readonly label: string;
}

function NavItem({ theme, to, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: S.NAV_ITEM_GAP,
        height: S.NAV_ITEM_HEIGHT,
        padding: `0 ${S.NAV_ITEM_PADDING_X}px`,
        borderRadius: S.NAV_ITEM_RADIUS,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        background: isActive ? theme.state.selected.bg : 'transparent',
        color: isActive ? theme.state.selected.fg : theme.text.secondary,
        fontWeight: isActive ? TYPE_STYLES.bodyMedium.weight : TYPE_STYLES.bodySm.weight,
        transition: `background ${S.TRANSITION_MS}ms ${S.TRANSITION_EASING}`,
        ...typeStyle(S.NAV_ITEM_TYPE),
      })}
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            style={{
              width: S.NAV_ACCENT_WIDTH,
              height: S.NAV_ACCENT_HEIGHT,
              flexShrink: 0,
              borderRadius: RADIUS.full,
              background: isActive ? theme.state.selected.border : 'transparent',
            }}
          />
          {label}
        </>
      )}
    </NavLink>
  );
}

function GroupLabel({ theme, children }: { readonly theme: Theme; readonly children: string }) {
  return (
    <span
      style={{
        ...typeStyle(S.NAV_GROUP_TYPE),
        color: theme.text.tertiary,
        padding: `0 ${S.NAV_ITEM_PADDING_X}px`,
      }}
    >
      {children}
    </span>
  );
}

function CurrentViewSection({ theme }: { readonly theme: Theme }) {
  const { views, currentView, selectView, loading, error, retry } = useCurrentView();
  const [adding, setAdding] = useState(false);

  // 三態：載入失敗（可重試）與「真的沒有檢視」文案不同，避免使用者把
  // 一次可重試的載入失敗誤判成帳號下沒有任何檢視。
  const emptyLabel =
    error !== undefined ? '載入檢視失敗' : loading ? '載入中…' : '尚無檢視';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.GROUP_GAP }}>
      <GroupLabel theme={theme}>當前檢視</GroupLabel>
      {views.length > 0 ? (
        <Select
          size="sm"
          options={views.map((v) => ({ value: v.id, label: v.name }))}
          {...(currentView !== null ? { value: currentView.id } : {})}
          onChange={selectView}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.NAV_GAP }}>
          <span
            role={error !== undefined ? 'alert' : undefined}
            style={{
              ...typeStyle(S.BRAND_META_TYPE),
              color: error !== undefined ? theme.status.error_fg : theme.text.tertiary,
              padding: `0 ${S.NAV_ITEM_PADDING_X}px`,
            }}
          >
            {emptyLabel}
          </span>
          {error !== undefined && (
            <Button variant="ghost" size="sm" fullWidth label="重試" onClick={retry} />
          )}
        </div>
      )}
      <Button
        variant="secondary"
        fullWidth
        label="新增檢視"
        onClick={() => setAdding((prev) => !prev)}
      />
      {adding && <AddViewForm onCancel={() => setAdding(false)} onCreated={() => setAdding(false)} />}
    </div>
  );
}

function AppShellInner() {
  const { theme, themeId, toggleTheme } = useTheme();
  const { account, logout } = useAuth();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: '100%',
        background: theme.bg.base,
        color: theme.text.primary,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      <aside
        style={{
          width: S.SIDEBAR_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S.SIDEBAR_GAP,
          padding: S.SIDEBAR_PADDING,
          background: theme.bg.surface,
          borderRight: `${S.SIDEBAR_BORDER_WIDTH}px solid ${theme.border.base}`,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.BRAND_GAP, minWidth: 0 }}>
          <span style={{ ...typeStyle(S.BRAND_TYPE), color: theme.text.primary }}>IGotThis</span>
          <span style={{ ...typeStyle(S.BRAND_META_TYPE), color: theme.text.tertiary }}>
            工單系統
          </span>
        </div>

        <CurrentViewSection theme={theme} />

        <nav
          aria-label="主導覽"
          style={{ display: 'flex', flexDirection: 'column', gap: S.NAV_GAP, flex: 1 }}
        >
          <GroupLabel theme={theme}>畫面</GroupLabel>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.path} theme={theme} to={item.path} label={item.label} />
          ))}
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S.NAV_GAP }}>
          {account !== null && (
            <span
              style={{
                ...typeStyle(S.BRAND_META_TYPE),
                color: theme.text.tertiary,
                padding: `0 ${S.NAV_ITEM_PADDING_X}px`,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {account.name}
            </span>
          )}
          <Button
            variant="secondary"
            fullWidth
            label={themeId === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
            onClick={toggleTheme}
          />
          <Button variant="ghost" fullWidth label="登出" onClick={() => void logout()} />
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

export function AppShell() {
  return (
    <CurrentViewProvider>
      <AppShellInner />
    </CurrentViewProvider>
  );
}
