// WorkflowTransitionScreen 內部子元件 · 不對外匯出
//
// IssueTypeRow 比照 design 端的 WT_IssueTypeRow：區域性小元件，現有元件組
// 沒有對應件，且只有本畫面用得到，留在畫面檔內（design 檔頭原話）。
//
// 各表單（NewStateForm／NewTransitionForm／NewResolutionForm）：design 畫面
// 稿只展開清單與觸發按鈕，未展開表單內容本身；本檔比照 TypeDefinitionScreen
// 既有表單（FormShell／FormActions）走同一套，不引入畫面稿沒有的元件。
//
// 範圍縮減：狀態、轉換只做新增／移除，不做行內編輯表單——design 的「編輯」
// 按鈕對應到「先移除、再用新值新增」這條路徑；狀態的「設為起始」走專屬按鈕，
// 直接整包送新的 isInitial 分布，不進表單。詳見 README 待接事項。

import { useState } from 'react';

import { Badge, Button, Select, TextInput } from '../../components/controls';
import { useTheme } from '../../theme';
import { FONT_FAMILY } from '../../theme';
import { WORKFLOW_TRANSITION_SCREEN_TOKENS as WT } from './tokens';

function rowType(t: { readonly size: number; readonly weight: number; readonly lineHeight: number; readonly letterSpacing?: number }) {
  return {
    fontSize: t.size,
    fontWeight: t.weight,
    lineHeight: `${t.lineHeight}px`,
    letterSpacing: t.letterSpacing,
  };
}

// ─── IssueTypeRow · 工單型別清單一列 ────────────────────────────

export interface IssueTypeRowProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}

export function IssueTypeRow({ label, selected, onClick }: IssueTypeRowProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: WT.ROW_HEIGHT,
        padding: `0 ${WT.ROW_PADDING_X}px`,
        border: 'none',
        borderRadius: WT.ROW_RADIUS,
        background: selected ? theme.state.selected.bg : hover ? theme.state.hover.bg : 'transparent',
        color: selected ? theme.state.selected.fg : theme.text.primary,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: FONT_FAMILY.base,
        ...rowType(WT.ROW_TYPE),
      }}
    >
      {label}
    </button>
  );
}

// ─── 起始狀態標示 ───────────────────────────────────────────────

export function InitialBadge() {
  return <Badge label="起始" tone="neutral" dot={false} />;
}

// ─── 表單共用外框（同 TypeDefinitionScreen 慣例） ─────────────────

interface FormShellProps {
  readonly children: React.ReactNode;
}

function FormShell({ children }: FormShellProps) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: WT.FORM_GAP,
        padding: WT.FORM_PADDING,
        borderRadius: WT.FORM_RADIUS,
        border: `1px solid ${theme.divider.hairline}`,
        width: WT.FORM_FIELD_WIDTH,
      }}
    >
      {children}
    </div>
  );
}

interface FormActionsProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly disabled?: boolean;
  readonly submitting?: boolean;
}

function FormActions({ onConfirm, onCancel, disabled = false, submitting = false }: FormActionsProps) {
  return (
    <div style={{ display: 'flex', gap: WT.ACTION_GAP, justifyContent: 'flex-end' }}>
      <Button variant="ghost" size="sm" label="取消" onClick={onCancel} disabled={submitting} />
      <Button variant="primary" size="sm" label="確認" onClick={onConfirm} disabled={disabled} loading={submitting} />
    </div>
  );
}

// ─── NewStateForm · 新增狀態：名稱、是否終止 ──────────────────────
// 新狀態預設非起始狀態；起始狀態透過清單列上的「設為起始」按鈕另外指派，
// 見畫面主檔的 onMarkInitial。

export interface NewStateInput {
  readonly name: string;
  readonly isTerminal: boolean;
}

export interface NewStateFormProps {
  readonly onSubmit: (input: NewStateInput) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}

export function NewStateForm({ onSubmit, onCancel, submitting }: NewStateFormProps) {
  const [name, setName] = useState('');
  const [isTerminal, setIsTerminal] = useState(false);
  return (
    <FormShell>
      <TextInput value={name} onChange={setName} placeholder="狀態名稱" fullWidth />
      <label style={{ display: 'flex', alignItems: 'center', gap: WT.ACTION_GAP }}>
        <input type="checkbox" checked={isTerminal} onChange={(e) => setIsTerminal(e.target.checked)} />
        終止狀態
      </label>
      <FormActions
        onConfirm={() => onSubmit({ name: name.trim(), isTerminal })}
        onCancel={onCancel}
        disabled={name.trim() === ''}
        submitting={submitting}
      />
    </FormShell>
  );
}

// ─── NewTransitionForm · 新增轉換：來源、目標、限定角色、必填欄位 ───

export interface NewTransitionInput {
  readonly fromState: string;
  readonly toState: string;
  readonly requiredRole: string | null;
  readonly requiredFields: readonly string[];
}

export interface NewTransitionFormProps {
  readonly stateOptions: readonly { readonly value: string; readonly label: string }[];
  readonly onSubmit: (input: NewTransitionInput) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}

export function NewTransitionForm({ stateOptions, onSubmit, onCancel, submitting }: NewTransitionFormProps) {
  const [fromState, setFromState] = useState('');
  const [toState, setToState] = useState('');
  const [requiredRole, setRequiredRole] = useState('');
  const [requiredFields, setRequiredFields] = useState('');

  const canSubmit = fromState !== '' && toState !== '';

  return (
    <FormShell>
      <Select
        prefix="來源狀態"
        options={stateOptions}
        {...(fromState !== '' ? { value: fromState } : {})}
        onChange={setFromState}
        fullWidth
      />
      <Select
        prefix="目標狀態"
        options={stateOptions}
        {...(toState !== '' ? { value: toState } : {})}
        onChange={setToState}
        fullWidth
      />
      <TextInput value={requiredRole} onChange={setRequiredRole} placeholder="限定角色，留空即不限" fullWidth />
      <TextInput
        value={requiredFields}
        onChange={setRequiredFields}
        placeholder="必填欄位，多個以逗號分隔"
        fullWidth
      />
      <FormActions
        onConfirm={() =>
          onSubmit({
            fromState,
            toState,
            requiredRole: requiredRole.trim() === '' ? null : requiredRole.trim(),
            requiredFields: requiredFields
              .split(',')
              .map((f) => f.trim())
              .filter((f) => f !== ''),
          })
        }
        onCancel={onCancel}
        disabled={!canSubmit}
        submitting={submitting}
      />
    </FormShell>
  );
}

// ─── NewResolutionForm · 新增結案原因：只填名稱 ──────────────────

export interface NewResolutionFormProps {
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}

export function NewResolutionForm({ onSubmit, onCancel, submitting }: NewResolutionFormProps) {
  const [value, setValue] = useState('');
  return (
    <FormShell>
      <TextInput value={value} onChange={setValue} placeholder="結案原因" fullWidth />
      <FormActions
        onConfirm={() => onSubmit(value.trim())}
        onCancel={onCancel}
        disabled={value.trim() === ''}
        submitting={submitting}
      />
    </FormShell>
  );
}
