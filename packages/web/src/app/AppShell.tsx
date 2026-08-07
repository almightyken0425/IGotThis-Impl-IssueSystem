// AppShell · 應用外殼
//
// 側邊導覽列切三個畫面，右側是路由出口。畫面本身不知道自己被掛在哪，
// 外殼也不碰畫面內部狀態，兩者只透過路由相接。
//
// design 對應：外殼在 design git 尚無定案的畫面檔——canvas 的 artboard 是把
// 單一畫面裱起來看，沒有導覽殼。故本檔的組裝值集中在 SHELL_TOKENS，
// 全部由既有 atomic 階梯組出、色彩全走當下 theme，等 design 出殼的定案再逐名對齊。
//
// 主題切換：ThemeProvider 在更上層（App.tsx），本檔只提供切換入口。

import { NavLink, Outlet } from 'react-router';

import { Button } from '../components/controls';
import {
  BORDER_WIDTH,
  CONTROL_HEIGHT,
  FONT_FAMILY,
  MOTION,
  RADIUS,
  SPACING,
  TYPE_STYLES,
  useTheme,
} from '../theme';
import type { Theme } from '../theme';
import { typeStyle } from '../screens/typeStyle';
import { NAV_ITEMS } from './routes';

const SHELL_TOKENS = {
  SIDEBAR_WIDTH: SPACING['3xl'] * 5, // 200
  SIDEBAR_PADDING: SPACING.md,
  SIDEBAR_GAP: SPACING.lg,
  SIDEBAR_BORDER_WIDTH: BORDER_WIDTH.hairline,

  BRAND_TYPE: TYPE_STYLES.sectionTitle,
  BRAND_META_TYPE: TYPE_STYLES.caption,
  BRAND_GAP: SPACING['2xs'],

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

export function AppShell() {
  const { theme, themeId, toggleTheme } = useTheme();

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
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.BRAND_GAP, minWidth: 0 }}>
          <span style={{ ...typeStyle(S.BRAND_TYPE), color: theme.text.primary }}>IGotThis</span>
          <span style={{ ...typeStyle(S.BRAND_META_TYPE), color: theme.text.tertiary }}>
            工單系統
          </span>
        </div>

        <nav
          aria-label="主導覽"
          style={{ display: 'flex', flexDirection: 'column', gap: S.NAV_GAP, flex: 1 }}
        >
          <span
            style={{
              ...typeStyle(S.NAV_GROUP_TYPE),
              color: theme.text.tertiary,
              padding: `0 ${S.NAV_ITEM_PADDING_X}px`,
            }}
          >
            檢視
          </span>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.path} theme={theme} to={item.path} label={item.label} />
          ))}
        </nav>

        <Button
          variant="secondary"
          fullWidth
          label={themeId === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
          onClick={toggleTheme}
        />
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
