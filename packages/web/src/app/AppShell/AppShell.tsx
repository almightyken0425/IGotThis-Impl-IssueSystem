// AppShell · 應用外殼
//
// 側邊四段：品牌、當前檢視、畫面形態導覽、帳號；右側是路由出口。
//
// 來源：design git 的 `30_screens/no4_app_shell/no4_app_shell.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no4_app_shell.md
//   佈局四段與互動五條逐條對位。
//
// 已知落差：
// - spec 的 selectCurrentView（ViewLogic）要求選了檢視後資料來源／篩選／欄位顯示
//   設定／排序值都跟著切換，目前完全沒有實作——CurrentViewContext 只是一個
//   本地 React state（currentViewId），選擇動作不連動任何資料；各畫面各自拿
//   currentView.id 打自己的端點。「切換畫面形態時當前檢視不變」是這個架構自然的
//   副作用（Provider 掛在 AppShell、不因路由換頁重新掛載），不是落地了
//   selectCurrentView 規則。
// - 內容區不比照 design 在無檢視時切 EmptyState，維持無條件 <Outlet/>——ListScreen／
//   KanbanScreen 已各自在畫面內判斷 currentView === null 顯示空狀態，AppShell 層級
//   不需要重複攔一次；DevOrderScreen 待接時比照辦理。
// - DevOrderScreen 尚未改接當前檢視（仍呼叫 workspaceApi）——甘特圖需要的座標轉換
//   （工單起訖日期換算時間軸格子、三層級同時載入）後端完全沒有，另開獨立主題處理。
// - 新增檢視表單（AddViewForm）與帳號預設日曆選用比照 design add-view variant 定案。
//
// 主題切換：ThemeProvider 在更上層（App.tsx），本檔只提供切換入口。

import { NavLink, Outlet } from 'react-router';
import { useCallback, useEffect, useState } from 'react';

import { accountsApi, calendarsApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { Button, Select } from '../../components/controls';
import { useAsync } from '../../hooks/useAsync';
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

/** 帳號預設日曆選用：個人偏好，選了立即持久化（對應 spec PermissionLogic / setDefaultCalendar）。 */
function AccountCalendarSelect() {
  const [defaultCalendar, setDefaultCalendar] = useState<string | undefined>(undefined);

  useEffect(() => {
    void accountsApi.getMyDefaultCalendar().then((value) => setDefaultCalendar(value ?? undefined));
  }, []);

  const calendars = useAsync(useCallback(() => calendarsApi.listCalendars(), []));

  const onChange = (value: string) => {
    const previous = defaultCalendar;
    setDefaultCalendar(value);
    void accountsApi.updateMyDefaultCalendar(value).catch(() => setDefaultCalendar(previous));
  };

  return (
    <Select
      size="sm"
      prefix="日曆"
      placeholder="未設定"
      options={calendars.data?.map((c) => ({ value: c.name, label: c.name })) ?? []}
      {...(defaultCalendar !== undefined ? { value: defaultCalendar } : {})}
      onChange={onChange}
      fullWidth
    />
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
          <AccountCalendarSelect />
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
