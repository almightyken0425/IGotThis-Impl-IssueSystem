// WorkflowTransitionScreen · 流程轉換規則管理畫面
//
// 角色：管理工單型別的狀態流程定義——狀態、轉換（含執行者角色與必填欄位）、
// 結案原因三個子清單。左欄選工單型別，右側三區塊並列。
//
// 來源：design git 的
// `30_screens/no8_workflow_transition_screen/no8_workflow_transition_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no3_logics/no4_workflow_logic.md
//   updateWorkflowDefinition：狀態、轉換、起始／終止狀態、結案原因皆可加可改可刪。
//
// 資料來源：型別清單一次抓；選定型別後另抓該型別的完整流程定義。三清單整包
// 替換走 PUT /:id/workflow（見 api/workflow.ts），前端每次操作在本地陣列上
// 增刪後整包送出，成功即 reload。
//
// 範圍縮減：狀態、轉換只做新增／移除，不做行內編輯表單；起始狀態透過「設為
// 起始」按鈕整包送新的 isInitial 分布。詳見 internal.tsx 開頭與 README 待接事項。

import { useCallback, useMemo, useState } from 'react';

import { ApiError, issueTypesApi, workflowApi } from '../../api';
import type { IssueTypeDefinition, WorkflowDefinition } from '../../api';
import { Button } from '../../components/controls';
import { DataTable, EmptyState } from '../../components/data';
import type { TableColumn, TableRow } from '../../components/data';
import { Toolbar } from '../../components/gantt';
import { useAsync } from '../../hooks/useAsync';
import { FONT_FAMILY, useTheme } from '../../theme';
import {
  InitialBadge,
  IssueTypeRow,
  NewResolutionForm,
  NewStateForm,
  NewTransitionForm,
} from './internal';
import type { NewStateInput, NewTransitionInput } from './internal';
import { WORKFLOW_TRANSITION_SCREEN_TOKENS as WT } from './tokens';

function toActionError(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失敗，請重試';
}

function typeStyleFromToken(t: { readonly size: number; readonly weight: number; readonly lineHeight: number }) {
  return { fontSize: t.size, fontWeight: t.weight, lineHeight: `${t.lineHeight}px`, fontFamily: FONT_FAMILY.base };
}

export function WorkflowTransitionScreen() {
  const { theme } = useTheme();

  const fetchTypes = useCallback(() => issueTypesApi.listIssueTypes(), []);
  const { data: issueTypes, loading: typesLoading, error: typesError } = useAsync(fetchTypes);

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [showNewStateForm, setShowNewStateForm] = useState(false);
  const [showNewTransitionForm, setShowNewTransitionForm] = useState(false);
  const [showNewResolutionForm, setShowNewResolutionForm] = useState(false);

  const fetchDefinition = useCallback(async (): Promise<WorkflowDefinition | null> => {
    if (selectedTypeId === null) return null;
    return workflowApi.getWorkflowDefinition(selectedTypeId);
  }, [selectedTypeId]);
  const { data: definition, loading: definitionLoading, error: definitionError, reload } = useAsync(fetchDefinition);

  const selectedType = (issueTypes ?? []).find((t) => t.id === selectedTypeId) ?? null;
  const states = definition?.states ?? [];
  const transitions = definition?.transitions ?? [];
  const resolutionOptions = definition?.resolutionOptions ?? [];
  const stateOptions = useMemo(
    () => states.map((s) => ({ value: s.name, label: s.name })),
    [states],
  );

  async function runAction(action: () => Promise<void>): Promise<void> {
    setSubmitting(true);
    setActionError(undefined);
    try {
      await action();
      await reload();
    } catch (err: unknown) {
      setActionError(toActionError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function submitDefinition(next: {
    states: readonly { name: string; isInitial: boolean; isTerminal: boolean }[];
    transitions: readonly {
      fromState: string;
      toState: string;
      requiredRole: string | null;
      requiredFields: readonly string[];
    }[];
    resolutionOptions: readonly { value: string }[];
  }): Promise<unknown> {
    if (selectedTypeId === null) return Promise.resolve(undefined);
    return workflowApi.updateWorkflowDefinition(selectedTypeId, next);
  }

  const onCreateState = (input: NewStateInput): void => {
    void runAction(async () => {
      await submitDefinition({
        states: [...states, { name: input.name, isInitial: states.length === 0, isTerminal: input.isTerminal }],
        transitions,
        resolutionOptions,
      });
      setShowNewStateForm(false);
    });
  };

  const onDeleteState = (name: string): void => {
    void runAction(async () => {
      await submitDefinition({
        states: states.filter((s) => s.name !== name),
        transitions,
        resolutionOptions,
      });
    });
  };

  const onMarkInitial = (name: string): void => {
    void runAction(async () => {
      await submitDefinition({
        states: states.map((s) => ({ ...s, isInitial: s.name === name })),
        transitions,
        resolutionOptions,
      });
    });
  };

  const onCreateTransition = (input: NewTransitionInput): void => {
    void runAction(async () => {
      await submitDefinition({
        states,
        transitions: [...transitions, input],
        resolutionOptions,
      });
      setShowNewTransitionForm(false);
    });
  };

  const onDeleteTransition = (fromState: string, toState: string): void => {
    void runAction(async () => {
      await submitDefinition({
        states,
        transitions: transitions.filter((t) => !(t.fromState === fromState && t.toState === toState)),
        resolutionOptions,
      });
    });
  };

  const onCreateResolution = (value: string): void => {
    void runAction(async () => {
      await submitDefinition({
        states,
        transitions,
        resolutionOptions: [...resolutionOptions, { value }],
      });
      setShowNewResolutionForm(false);
    });
  };

  const onDeleteResolution = (value: string): void => {
    void runAction(async () => {
      await submitDefinition({
        states,
        transitions,
        resolutionOptions: resolutionOptions.filter((r) => r.value !== value),
      });
    });
  };

  const stateColumns: readonly TableColumn[] = [
    { key: 'name', label: '狀態', type: 'text' },
    { key: 'flag', label: '', type: 'text' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_value, row) => (
        <div style={{ display: 'flex', gap: WT.ACTION_GAP, justifyContent: 'flex-end' }}>
          {row.cells['isInitial'] !== true && (
            <Button variant="ghost" size="sm" label="設為起始" onClick={() => onMarkInitial(row.id)} />
          )}
          <Button variant="ghost" size="sm" label="移除" onClick={() => onDeleteState(row.id)} />
        </div>
      ),
    },
  ];
  const stateRows: readonly TableRow[] = states.map((s) => ({
    id: s.name,
    cells: {
      name: s.name,
      flag: s.isInitial ? <InitialBadge /> : s.isTerminal ? '終止' : '',
      isInitial: s.isInitial,
    },
  }));

  const transitionColumns: readonly TableColumn[] = [
    { key: 'path', label: '轉換', type: 'text' },
    { key: 'requiredRole', label: '限定角色', type: 'text' },
    { key: 'requiredFields', label: '必填欄位', type: 'text' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_value, row) => (
        <Button
          variant="ghost"
          size="sm"
          label="移除"
          onClick={() => onDeleteTransition(row.cells['fromState'] as string, row.cells['toState'] as string)}
        />
      ),
    },
  ];
  const transitionRows: readonly TableRow[] = transitions.map((t) => ({
    id: `${t.fromState}->${t.toState}`,
    cells: {
      path: `${t.fromState} → ${t.toState}`,
      requiredRole: t.requiredRole ?? '不限',
      requiredFields: t.requiredFields.length > 0 ? t.requiredFields.join('、') : '無',
      fromState: t.fromState,
      toState: t.toState,
    },
  }));

  const resolutionColumns: readonly TableColumn[] = [
    { key: 'value', label: '結案原因', type: 'text' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_value, row) => (
        <Button variant="ghost" size="sm" label="移除" onClick={() => onDeleteResolution(row.id)} />
      ),
    },
  ];
  const resolutionRows: readonly TableRow[] = resolutionOptions.map((r) => ({ id: r.value, cells: { value: r.value } }));

  const toolbarLeft = (
    <span style={{ ...typeStyleFromToken(WT.SCREEN_TITLE_TYPE), color: theme.text.primary, whiteSpace: 'nowrap' }}>
      流程轉換規則
    </span>
  );

  if (typesLoading) return null;
  if (typesError !== undefined) {
    return (
      <div style={{ padding: WT.CONTENT_PADDING_Y }}>
        <EmptyState title="工單型別載入失敗" description={typesError} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.bg.base,
        color: theme.text.primary,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      <Toolbar left={toolbarLeft} />

      <div
        style={{
          display: 'flex',
          gap: WT.COLUMN_GAP,
          alignItems: 'flex-start',
          padding: `${WT.CONTENT_PADDING_Y}px ${WT.CONTENT_PADDING_X}px`,
        }}
      >
        <div style={{ width: WT.TYPE_COL_WIDTH, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: WT.GROUP_GAP }}>
          <span style={{ color: theme.text.tertiary, padding: `0 ${WT.ROW_PADDING_X}px` }}>工單型別</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: WT.ACTION_GAP }}>
            {(issueTypes ?? []).map((t: IssueTypeDefinition) => (
              <IssueTypeRow
                key={t.id}
                label={t.label}
                selected={t.id === selectedTypeId}
                onClick={() => setSelectedTypeId(t.id)}
              />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: WT.SECTION_GAP }}>
          {actionError !== undefined && <div style={{ color: theme.status.error_fg }}>{actionError}</div>}

          {selectedType === null ? (
            <EmptyState title="尚未選取工單型別" description="從左側選一個工單型別，檢視與管理該型別的流程轉換規則。" />
          ) : definitionLoading ? null : definitionError !== undefined ? (
            <EmptyState title="流程定義載入失敗" description={definitionError} />
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: WT.GROUP_GAP }}>
                <span style={{ ...typeStyleFromToken(WT.SUBSECTION_TITLE_TYPE), color: theme.text.secondary }}>狀態</span>
                <DataTable columns={stateColumns} rows={stateRows} />
                {showNewStateForm ? (
                  <NewStateForm onSubmit={onCreateState} onCancel={() => setShowNewStateForm(false)} submitting={submitting} />
                ) : (
                  <Button variant="secondary" size="sm" iconLeft="plus" label="新增狀態" onClick={() => setShowNewStateForm(true)} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: WT.GROUP_GAP }}>
                <span style={{ ...typeStyleFromToken(WT.SUBSECTION_TITLE_TYPE), color: theme.text.secondary }}>轉換</span>
                <DataTable columns={transitionColumns} rows={transitionRows} />
                {showNewTransitionForm ? (
                  <NewTransitionForm
                    stateOptions={stateOptions}
                    onSubmit={onCreateTransition}
                    onCancel={() => setShowNewTransitionForm(false)}
                    submitting={submitting}
                  />
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft="plus"
                    label="新增轉換"
                    onClick={() => setShowNewTransitionForm(true)}
                    disabled={states.length === 0}
                  />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: WT.GROUP_GAP }}>
                <span style={{ ...typeStyleFromToken(WT.SUBSECTION_TITLE_TYPE), color: theme.text.secondary }}>結案原因</span>
                <DataTable columns={resolutionColumns} rows={resolutionRows} />
                {showNewResolutionForm ? (
                  <NewResolutionForm
                    onSubmit={onCreateResolution}
                    onCancel={() => setShowNewResolutionForm(false)}
                    submitting={submitting}
                  />
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft="plus"
                    label="新增結案原因"
                    onClick={() => setShowNewResolutionForm(true)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
