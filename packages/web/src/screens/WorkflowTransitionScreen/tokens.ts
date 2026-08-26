// WORKFLOW_TRANSITION_SCREEN_TOKENS · 流程轉換規則畫面的 composition 參數
//
// 來源：design git 的
// `30_screens/no8_workflow_transition_screen/no8_workflow_transition_screen.jsx`
// 檔內 WORKFLOW_TRANSITION_TOKENS。仲裁關係：design git 是視覺標準的唯一仲裁端，
// impl 逐名對齊。
//
// 未搬入 BASE_WIDTH：canvas 需要固定尺寸 artboard，app 內畫面吃 AppShell 的
// 剩餘空間，比照 TypeDefinitionScreen 的 tokens.ts 對 BASE_WIDTH 的處理方式。

import { CONTROL_HEIGHT, RADIUS, SPACING, TYPE_STYLES } from '../../theme';

export const WORKFLOW_TRANSITION_SCREEN_TOKENS = {
  CONTENT_PADDING_X: SPACING.xl, // 24
  CONTENT_PADDING_Y: SPACING.lg, // 16
  SECTION_GAP: SPACING.lg, // 16，三區塊之間
  SCREEN_TITLE_TYPE: TYPE_STYLES.sectionTitle,
  TYPE_COL_WIDTH: SPACING['3xl'] * 5, // 200，對齊 TypeDefinitionScreen 側欄寬基準
  COLUMN_GAP: SPACING.xl, // 24，型別清單與內容區之間
  ROW_HEIGHT: CONTROL_HEIGHT.lg, // 32
  ROW_PADDING_X: SPACING.sm, // 8
  ROW_RADIUS: RADIUS.sm,
  ROW_TYPE: TYPE_STYLES.bodySm,
  ACTION_GAP: SPACING.xs, // 4
  GROUP_LABEL_TYPE: TYPE_STYLES.overline,
  GROUP_GAP: SPACING.sm, // 8
  SUBSECTION_TITLE_TYPE: TYPE_STYLES.label,

  // 新增表單：畫面稿未展開表單內容，比照 TypeDefinitionScreen 既有表單間距慣例組出。
  FORM_GAP: SPACING.sm,
  FORM_PADDING: SPACING.md,
  FORM_RADIUS: RADIUS.md,
  FORM_FIELD_WIDTH: SPACING['3xl'] * 8, // 320
} as const;
