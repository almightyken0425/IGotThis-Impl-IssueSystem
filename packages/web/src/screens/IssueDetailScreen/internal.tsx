// IssueDetailScreen · 私有小元件
//
// 只服務 IssueDetailScreen，既有元件組無對應件（本畫面無 design git 來源，
// 見 tokens.ts 開頭說明）。三塊：SectionPanel（區塊容器）／FieldRow 系列
// （欄位區一列）／RelationGroup（關聯區一個分組）／ChangeLogRow（異動歷史
// 一列）／StatusResolutionPrompt（Status 轉終止狀態的結案原因選擇）。

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Button, IconButton, Select, TextInput } from '../../components/controls';
import type { SelectOption } from '../../components/controls';
import {
  FONT_FAMILY,
  NUMERIC_FONT_VARIANT,
  TYPE_STYLES,
  useTheme,
} from '../../theme';
import type { WorkspaceResolutionOption } from '../../api';
import { typeStyle } from '../typeStyle';
import { ISSUE_DETAIL_SCREEN_TOKENS } from './tokens';

const T = ISSUE_DETAIL_SCREEN_TOKENS;

/** 任意欄位值 → 可讀文字；null/undefined/空字串統一顯示「(無)」。 */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(無)';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  return JSON.stringify(value);
}

/** 異動歷史時間戳 → "YYYY-MM-DD HH:mm"，對齊 Spec 線框圖格式。 */
export function formatChangeLogTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── SectionPanel · 區塊容器 ─────────────────────────────────
// 欄位區／關聯區／異動歷史區共用的卡片外框：標題 + 內容堆疊。

export interface SectionPanelProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function SectionPanel({ title, children }: SectionPanelProps) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: T.PANEL_GAP,
        minWidth: 0,
        padding: T.PANEL_PADDING,
        background: theme.bg.surface,
        border: `${T.PANEL_BORDER_WIDTH}px solid ${theme.border.base}`,
        borderRadius: T.PANEL_RADIUS,
      }}
    >
      <span style={{ ...typeStyle(T.PANEL_TITLE_TYPE), color: theme.text.secondary }}>{title}</span>
      {children}
    </div>
  );
}

// ─── FieldRow · 欄位區一列 ───────────────────────────────────
// label 定寬左欄 + 控件右欄；唯讀與可編輯共用同一列殼，切換時列高不跳動。

export interface FieldRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

export function FieldRow({ label, children }: FieldRowProps) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: T.FIELD_ROW_GAP,
        minHeight: T.FIELD_ROW_MIN_HEIGHT,
      }}
    >
      <span
        style={{
          width: T.FIELD_LABEL_WIDTH,
          flexShrink: 0,
          ...typeStyle(TYPE_STYLES.label),
          color: theme.text.secondary,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: T.FIELD_CONFIRM_GAP }}>
        {children}
      </div>
    </div>
  );
}

/** 唯讀欄位值：純文字，超長截斷。 */
export function ReadOnlyValue({ text }: { readonly text: string }) {
  const { theme } = useTheme();
  return (
    <span
      title={text}
      style={{
        ...typeStyle(T.FIELD_VALUE_TYPE),
        color: theme.text.primary,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

// ─── EditableTextField · 可編輯欄位的文字輸入 ────────────────
// 草稿與已提交值分離：Enter 或按確認鈕才呼叫 onCommit，值型別轉換
// （StoryPoint 轉數字、空字串轉 null 等）交給呼叫端在 onCommit 內處理，
// 本元件只管文字草稿與「何時算使用者確認了」。
//
// Enter 鍵透過事件冒泡在外層 div 接（TextInput 本身不轉發 onKeyDown），
// 比照 ListScreen 的 CreateIssueBar 同一手法。

export interface EditableTextFieldProps {
  readonly value: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly onCommit: (next: string) => void;
}

export function EditableTextField({ value, placeholder, disabled = false, onCommit }: EditableTextFieldProps) {
  const [draft, setDraft] = useState(value);
  // 外部值變動（如 reload 拿到新資料）時重置草稿，避免殘留上一版未提交的字。
  useEffect(() => setDraft(value), [value]);

  const dirty = draft !== value;
  const commit = () => {
    if (!dirty || disabled) return;
    onCommit(draft);
  };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: T.FIELD_CONFIRM_GAP, flex: 1, minWidth: 0 }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    >
      <TextInput
        value={draft}
        disabled={disabled}
        onChange={setDraft}
        fullWidth
        style={{ flex: 1 }}
        {...(placeholder === undefined ? {} : { placeholder })}
      />
      {dirty && !disabled && <IconButton icon="check" title="儲存" size="sm" onClick={commit} />}
    </div>
  );
}

// ─── RelationGroup · 關聯區一個分組 ──────────────────────────
// 標題 + 對側工單編號清單；空清單不畫（由呼叫端決定是否要整體空狀態）。

export interface RelationGroupItem {
  readonly id: string;
  readonly key: string;
}

export interface RelationGroupProps {
  readonly title: string;
  readonly items: readonly RelationGroupItem[];
}

export function RelationGroup({ title, items }: RelationGroupProps) {
  const { theme } = useTheme();
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.GROUP_GAP, minWidth: 0 }}>
      <span style={{ ...typeStyle(T.GROUP_TITLE_TYPE), color: theme.text.tertiary }}>{title}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.RELATION_ITEM_GAP }}>
        {items.map((item) => (
          <span
            key={item.id}
            style={{
              ...typeStyle(T.RELATION_ITEM_TYPE),
              fontFamily: FONT_FAMILY.mono,
              fontVariantNumeric: NUMERIC_FONT_VARIANT,
              color: theme.primary.main,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.key}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── ChangeLogRow · 異動歷史一列 ─────────────────────────────
// 時間 / 欄位標籤 / 舊值→新值 / 執行者，逐欄定寬對齊，對齊 Spec 線框圖排法。

export interface ChangeLogRowEntry {
  readonly id: string;
  readonly fieldName: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actor: string;
  readonly time: number;
}

export interface ChangeLogRowProps {
  readonly entry: ChangeLogRowEntry;
  readonly fieldLabel: string;
}

export function ChangeLogRow({ entry, fieldLabel }: ChangeLogRowProps) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: T.CHANGELOG_ROW_GAP,
        padding: `${T.CHANGELOG_ROW_PADDING_Y}px 0`,
        borderTop: `1px solid ${theme.divider.base}`,
      }}
    >
      <span
        style={{
          width: T.CHANGELOG_TIME_WIDTH,
          flexShrink: 0,
          ...typeStyle(T.CHANGELOG_META_TYPE),
          color: theme.text.tertiary,
          fontVariantNumeric: NUMERIC_FONT_VARIANT,
        }}
      >
        {formatChangeLogTime(entry.time)}
      </span>
      <span
        style={{
          width: T.CHANGELOG_FIELD_WIDTH,
          flexShrink: 0,
          ...typeStyle(T.CHANGELOG_TYPE),
          color: theme.text.secondary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {fieldLabel}
      </span>
      <span style={{ flex: 1, minWidth: 0, ...typeStyle(T.CHANGELOG_TYPE), color: theme.text.primary }}>
        {`${displayValue(entry.oldValue)} → ${displayValue(entry.newValue)}`}
      </span>
      <span
        style={{
          flexShrink: 0,
          ...typeStyle(T.CHANGELOG_META_TYPE),
          color: theme.text.tertiary,
          fontFamily: FONT_FAMILY.mono,
        }}
      >
        {entry.actor}
      </span>
    </div>
  );
}

// ─── StatusResolutionPrompt · Status 轉終止狀態的結案原因選擇 ─
// 比照 KanbanScreen 的 KanbanResolutionPrompt 語意（未選不得確認、取消則
// Status 維持原值），視覺改走行內面板（本畫面 Status 是欄位列而非看板卡，
// 不需要浮層蓋版）。

export interface StatusResolutionPromptProps {
  readonly targetStatus: string;
  readonly options: readonly WorkspaceResolutionOption[];
  readonly submitting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (resolutionValue: string) => void;
}

export function StatusResolutionPrompt({
  targetStatus,
  options,
  submitting,
  onCancel,
  onConfirm,
}: StatusResolutionPromptProps) {
  const { theme } = useTheme();
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const selectOptions: readonly SelectOption[] = options.map((o) => ({ value: o.value, label: o.value }));

  return (
    <div
      role="dialog"
      aria-label="選擇結案原因"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: T.PROMPT_GAP,
        padding: T.PROMPT_PADDING,
        background: theme.bg.surface_dim,
        border: `${T.PROMPT_BORDER_WIDTH}px solid ${theme.border.base}`,
        borderRadius: T.PROMPT_RADIUS,
      }}
    >
      <span style={{ ...typeStyle(T.PROMPT_TYPE), color: theme.text.secondary }}>
        {`轉為「${targetStatus}」須選擇結案原因`}
      </span>
      <Select
        placeholder="選擇結案原因"
        options={selectOptions}
        onChange={setPicked}
        disabled={submitting}
        {...(picked === undefined ? {} : { value: picked })}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: T.FIELD_CONFIRM_GAP }}>
        <Button variant="ghost" size="sm" label="取消" disabled={submitting} onClick={onCancel} />
        <Button
          variant="primary"
          size="sm"
          label="確認結案"
          loading={submitting}
          disabled={picked === undefined}
          onClick={() => {
            if (picked !== undefined) onConfirm(picked);
          }}
        />
      </div>
    </div>
  );
}
