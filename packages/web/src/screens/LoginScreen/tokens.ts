// LOGIN_SCREEN_TOKENS · 登入頁的 composition 參數
//
// 對齊 design git no4_product_designs/no1_issue_system 的
// project/30_screens/no7_login_screen/no7_login_screen.jsx 定案值
// （LOGIN_SCREEN_TOKENS 逐名對照，命名字尾不含 SCREEN 差異外皆一致）。

import { BORDER_WIDTH, RADIUS, SPACING, TYPE_STYLES } from '../../theme';

export const LOGIN_SCREEN_TOKENS = {
  FORM_WIDTH: SPACING['3xl'] * 9, // 360
  FORM_PADDING: SPACING.xl, // 24
  FORM_GAP: SPACING.lg, // 16
  FORM_RADIUS: RADIUS.lg, // 8
  FORM_BORDER_WIDTH: BORDER_WIDTH.hairline,
  FIELD_GAP: SPACING['2xs'], // 2，label 與輸入框之間
  TITLE_TYPE: TYPE_STYLES.sectionTitle,
  SUBTITLE_TYPE: TYPE_STYLES.caption,
  FIELD_LABEL_TYPE: TYPE_STYLES.caption,
  SWITCH_TYPE: TYPE_STYLES.caption,
  OUTER_PADDING: SPACING['2xl'], // 32，artboard／viewport 邊界到卡片
} as const;
