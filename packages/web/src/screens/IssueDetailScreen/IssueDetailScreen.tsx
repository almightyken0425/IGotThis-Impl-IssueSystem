// IssueDetailScreen · 工單詳情頁
//
// 角色：檢視與編輯單張工單的完整欄位、關聯、異動歷史。List／Kanban／
// DevOrder 三畫面的工單列點擊（雙擊 / 點卡 / 點列）導覽至此。
//
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no5_issue_detail_screen.md
// 另讀 no3_logics/no6_changelog_logic.md（listIssueChangelog）與
// no3_logics/no1_relation_integrity_logic.md（listIssueRelations）。
// 本畫面尚無對應 design git 來源檔，見 tokens.ts 開頭說明。
//
// 資料來源：一次 useAsync 內 Promise.all 八支唯讀 API（工單基本識別、欄位
// 定義、欄位值、異動歷史、關聯型別、正查關聯、反查關聯、工作區脈絡），
// 關聯的對側工單編號另在同一 fetcher 內第二階段解析（見 resolveCounterpartKeys）。
// 任一欄位／Status 寫入成功後整個 reload()，不做樂觀本地更新——失敗時畫面
// 自然維持原資料，滿足 Spec「操作失敗時 Status 維持原值」而不必另寫回滾。
//
// 編輯範圍（v1 刻意收斂）：只開放 workspace.ts PATCH /api/workspace/issues/:id
// 認得的 6 個白名單欄位（title/status/resolution/assignee/point/due）。
// status/resolution 一組走 Status 控件觸發的 changeIssueStatus 流程；
// 其餘白名單欄位走同一個 PATCH 的一般欄位寫入。白名單外、readonly=false
// 的欄位這次先唯讀顯示——見下方 renderFieldValue 內的專門註解與
// impl 根目錄 README.md「待接事項」。

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
  ApiError,
  fieldsApi,
  issuesApi,
  relationsApi,
  workspaceApi,
} from '../../api';
import type {
  ChangeLogEntry,
  FieldDef,
  IssueFieldValue,
  IssueRelation,
  IssueSummary,
  RelationTypeDefinition,
  UpdateIssueInput,
  WorkspaceContext,
} from '../../api';
import { Button, Select } from '../../components/controls';
import { EmptyState } from '../../components/data';
import { Toolbar } from '../../components/gantt';
import { useAsync } from '../../hooks/useAsync';
import { FONT_FAMILY, NUMERIC_FONT_VARIANT, TYPE_STYLES, useTheme } from '../../theme';
import { typeStyle } from '../typeStyle';
import {
  ChangeLogRow,
  displayValue,
  EditableTextField,
  FieldRow,
  ReadOnlyValue,
  RelationGroup,
  SectionPanel,
  StatusResolutionPrompt,
} from './internal';
import type { RelationGroupItem } from './internal';
import { ISSUE_DETAIL_SCREEN_TOKENS } from './tokens';

const T = ISSUE_DETAIL_SCREEN_TOKENS;

/** 對齊 server domain/relation/types.ts 的 CHILDREN_RELATION_TYPE_NAME；web 無法跨包 import domain 常數，逐名複製。 */
const CHILDREN_RELATION_TYPE_NAME = 'Children';

/** workspace.ts PATCH 認得的白名單欄位裡，走「一般欄位寫入」這條、非 Status/Resolution 的四個。 */
const GENERIC_EDITABLE_FIELDS = new Set(['title', 'assignee', 'point', 'due']);

/** 欄位區顯示順序：白名單依 Spec 線框圖順序在前，其餘（含未來自訂欄位）依名稱字母序接在後面。 */
const FIELD_DISPLAY_ORDER = ['title', 'status', 'resolution', 'assignee', 'point', 'due'];

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function orderFieldDefs(defs: readonly FieldDef[]): readonly FieldDef[] {
  const rank = new Map(FIELD_DISPLAY_ORDER.map((name, i) => [name, i]));
  return [...defs].sort((a, b) => {
    const ra = rank.get(a.name) ?? FIELD_DISPLAY_ORDER.length;
    const rb = rank.get(b.name) ?? FIELD_DISPLAY_ORDER.length;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

interface IssueDetailData {
  readonly issue: IssueSummary;
  readonly fieldDefs: readonly FieldDef[];
  readonly fieldValues: readonly IssueFieldValue[];
  readonly changeLog: readonly ChangeLogEntry[];
  readonly relationTypes: readonly RelationTypeDefinition[];
  readonly relationsFrom: readonly IssueRelation[];
  readonly relationsTo: readonly IssueRelation[];
  /** 關聯對側工單 id → issueKey；查無（如已刪除）的項不進表，顯示端回退用 id。 */
  readonly counterpartKeys: ReadonlyMap<string, string>;
  readonly workspace: WorkspaceContext;
}

/** 關聯清單的對側工單 id 集合去重後並行解析 issueKey；單筆查詢失敗（如已刪除）不拖垮整頁，跳過即可。 */
async function resolveCounterpartKeys(
  relationsFrom: readonly IssueRelation[],
  relationsTo: readonly IssueRelation[],
): Promise<ReadonlyMap<string, string>> {
  const ids = new Set<string>();
  for (const r of relationsFrom) ids.add(r.toIssueId);
  for (const r of relationsTo) ids.add(r.fromIssueId);

  const entries = await Promise.all(
    [...ids].map(async (id): Promise<readonly [string, string] | undefined> => {
      try {
        const summary = await issuesApi.getIssue(id);
        return [id, summary.issueKey] as const;
      } catch {
        return undefined;
      }
    }),
  );
  return new Map(entries.filter((e): e is readonly [string, string] => e !== undefined));
}

interface RelationsView {
  readonly parents: readonly RelationGroupItem[];
  readonly children: readonly RelationGroupItem[];
  readonly otherGroups: readonly { readonly relationTypeId: string; readonly typeName: string; readonly items: readonly RelationGroupItem[] }[];
  readonly isEmpty: boolean;
}

/** 依關聯型別分組；母子鏈拆父／子兩組，其餘型別各自一組。對齊 listIssueRelations 的分組契約。 */
function buildRelationsView(data: IssueDetailData): RelationsView {
  const typesById = new Map(data.relationTypes.map((t) => [t.id, t]));
  const childrenType = data.relationTypes.find((t) => t.name === CHILDREN_RELATION_TYPE_NAME);
  const keyOf = (id: string): string => data.counterpartKeys.get(id) ?? id;

  const parents: RelationGroupItem[] = [];
  const children: RelationGroupItem[] = [];
  const otherByType = new Map<string, { typeName: string; items: RelationGroupItem[] }>();

  const addOther = (relationTypeId: string, counterpartId: string) => {
    const typeName = typesById.get(relationTypeId)?.name ?? '未知關聯型別';
    const bucket = otherByType.get(relationTypeId) ?? { typeName, items: [] };
    if (!bucket.items.some((item) => item.id === counterpartId)) {
      bucket.items.push({ id: counterpartId, key: keyOf(counterpartId) });
    }
    otherByType.set(relationTypeId, bucket);
  };

  // 正查（this issue 為持有端）：母子鏈下對側為子工單，其餘型別對側走一般分組。
  for (const r of data.relationsFrom) {
    if (childrenType !== undefined && r.relationTypeId === childrenType.id) {
      children.push({ id: r.toIssueId, key: keyOf(r.toIssueId) });
    } else {
      addOther(r.relationTypeId, r.toIssueId);
    }
  }
  // 反查（this issue 為被指端）：母子鏈下對側為上層（母），其餘型別對側走一般分組。
  for (const r of data.relationsTo) {
    if (childrenType !== undefined && r.relationTypeId === childrenType.id) {
      parents.push({ id: r.fromIssueId, key: keyOf(r.fromIssueId) });
    } else {
      addOther(r.relationTypeId, r.fromIssueId);
    }
  }

  const otherGroups = [...otherByType.entries()]
    .map(([relationTypeId, bucket]) => ({ relationTypeId, typeName: bucket.typeName, items: bucket.items }))
    .sort((a, b) => a.typeName.localeCompare(b.typeName));

  const isEmpty = parents.length === 0 && children.length === 0 && otherGroups.length === 0;
  return { parents, children, otherGroups, isEmpty };
}

export function IssueDetailScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { issueId = '' } = useParams<{ issueId: string }>();

  const fetcher = useCallback(async (): Promise<IssueDetailData> => {
    const [issue, fieldDefs, fieldValues, changeLog, relationTypes, relationsFrom, relationsTo, workspace] =
      await Promise.all([
        issuesApi.getIssue(issueId),
        fieldsApi.listFieldDefs(),
        issuesApi.listFieldValues(issueId),
        issuesApi.listChangelog(issueId),
        relationsApi.listRelationTypes(),
        relationsApi.listRelationsFrom(issueId),
        relationsApi.listRelationsTo(issueId),
        workspaceApi.getWorkspace(),
      ]);
    const counterpartKeys = await resolveCounterpartKeys(relationsFrom, relationsTo);
    return {
      issue,
      fieldDefs,
      fieldValues,
      changeLog,
      relationTypes,
      relationsFrom,
      relationsTo,
      counterpartKeys,
      workspace,
    };
  }, [issueId]);
  const { data, loading, error, reload } = useAsync(fetcher);

  const [pendingField, setPendingField] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [resolutionTarget, setResolutionTarget] = useState<string | null>(null);

  const commitField = useCallback(
    async (fieldName: string, patch: UpdateIssueInput) => {
      // 同一時間只允許一筆欄位寫入在飛行中，避免兩筆並發 PATCH 互相踩到
      // pendingField 的記帳（比照 KanbanScreen 的 pendingKey 單筆語意）。
      if (pendingField !== null) return;
      setPendingField(fieldName);
      setFieldError(undefined);
      try {
        await workspaceApi.updateIssue(issueId, patch);
        await reload();
      } catch (err: unknown) {
        setFieldError(err instanceof ApiError ? err.message : '更新失敗');
      } finally {
        setPendingField(null);
      }
    },
    [issueId, reload, pendingField],
  );

  // 一般欄位（非 Status）文字提交：型別轉換與空值語意集中於此，EditableTextField 只管字串草稿。
  const commitTextField = useCallback(
    (fieldName: string, text: string) => {
      const trimmed = text.trim();
      switch (fieldName) {
        case 'title':
          // title 不可清空；未通過驗證就靜默忽略，草稿留在編輯框待補內容。
          if (trimmed === '') return;
          void commitField('title', { title: trimmed });
          return;
        case 'assignee':
          void commitField('assignee', { assignee: text });
          return;
        case 'point': {
          if (trimmed === '') {
            void commitField('point', { point: null });
            return;
          }
          const parsed = Number(trimmed);
          if (!Number.isFinite(parsed)) {
            setFieldError('StoryPoint 須為數字');
            return;
          }
          void commitField('point', { point: parsed });
          return;
        }
        case 'due':
          void commitField('due', { due: trimmed === '' ? null : trimmed });
          return;
        default:
          return;
      }
    },
    [commitField],
  );

  const fieldValueByName = useMemo(
    () => new Map((data?.fieldValues ?? []).map((v) => [v.fieldName, v.value])),
    [data?.fieldValues],
  );
  const fieldLabelByName = useMemo(
    () => new Map((data?.fieldDefs ?? []).map((d) => [d.name, d.label])),
    [data?.fieldDefs],
  );
  const singleFieldDefs = useMemo(
    () => orderFieldDefs((data?.fieldDefs ?? []).filter((d) => d.kind === 'single')),
    [data?.fieldDefs],
  );

  const currentStatus = asString(fieldValueByName.get('status'));
  const terminalSet = useMemo(
    () => new Set((data?.workspace.statuses ?? []).filter((s) => s.isTerminal).map((s) => s.name)),
    [data?.workspace.statuses],
  );

  const applyStatusChange = useCallback(
    (targetStatus: string, resolution?: string) => {
      const patch: UpdateIssueInput =
        resolution === undefined ? { status: targetStatus } : { status: targetStatus, resolution };
      return commitField('status', patch);
    },
    [commitField],
  );

  const onStatusChange = useCallback(
    (targetStatus: string) => {
      if (targetStatus === currentStatus) return;
      if (terminalSet.has(targetStatus)) {
        setResolutionTarget(targetStatus);
        return;
      }
      // 清掉可能殘留的舊結案原因選擇面板：使用者若在面板開著時又選了非終止
      // 狀態，這筆直接送出，不該留一片對不上目前選擇的舊面板在下面。
      setResolutionTarget(null);
      void applyStatusChange(targetStatus);
    },
    [currentStatus, terminalSet, applyStatusChange],
  );

  const onResolutionConfirm = useCallback(
    (resolutionValue: string) => {
      const target = resolutionTarget;
      if (target === null) return;
      setResolutionTarget(null);
      void applyStatusChange(target, resolutionValue);
    },
    [resolutionTarget, applyStatusChange],
  );
  const onResolutionCancel = useCallback(() => setResolutionTarget(null), []);

  const relationsView = useMemo(() => (data === undefined ? undefined : buildRelationsView(data)), [data]);

  // ─── 欄位區單列渲染 ──────────────────────────────────────────
  function renderFieldValue(def: FieldDef) {
    const raw = fieldValueByName.get(def.name);

    if (def.name === 'status') {
      const statusOptions = (data?.workspace.statuses ?? []).map((s) => ({ value: s.name, label: s.name }));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: T.FIELD_CONFIRM_GAP, flex: 1, minWidth: 0 }}>
          <Select
            options={statusOptions}
            disabled={pendingField === 'status'}
            onChange={onStatusChange}
            {...(currentStatus === '' ? {} : { value: currentStatus })}
          />
          {resolutionTarget !== null && (
            <StatusResolutionPrompt
              targetStatus={resolutionTarget}
              options={data?.workspace.resolutionOptions ?? []}
              submitting={pendingField === 'status'}
              onCancel={onResolutionCancel}
              onConfirm={onResolutionConfirm}
            />
          )}
        </div>
      );
    }

    if (def.name === 'resolution') {
      // Resolution 只隨一次真正的 Status 轉換一併寫入（見 workspace.ts PATCH 的
      // RESOLUTION_REQUIRES_STATUS_CHANGE 規則），本畫面不給獨立輸入框，
      // 空值顯示對齊 Spec 線框圖的「尚未結案」而非泛用的「(無)」。
      const text = typeof raw === 'string' && raw !== '' ? raw : '尚未結案';
      return <ReadOnlyValue text={text} />;
    }

    if (def.readonly) {
      return <ReadOnlyValue text={displayValue(raw)} />;
    }

    if (GENERIC_EDITABLE_FIELDS.has(def.name)) {
      const textValue = def.name === 'point' ? (typeof raw === 'number' ? String(raw) : '') : asString(raw);
      return (
        <EditableTextField
          value={textValue}
          disabled={pendingField === def.name}
          onCommit={(text) => commitTextField(def.name, text)}
        />
      );
    }

    // v1 刻意收斂：readonly=false 但不在白名單內的欄位，這次先唯讀顯示。
    // 原因是目前只有 workspace.ts 的 PATCH /api/workspace/issues/:id 這條寫入
    // 路徑會呼叫 recordFieldChange、正確記錄變更歷史；issues.ts 的泛用欄位
    // 寫入路徑（PUT /issues/:issueId/fields/:fieldName）尚未補上這段，這次
    // 刻意不動那條既有路徑（見 impl 根目錄 README.md「待接事項」）。
    return <ReadOnlyValue text={displayValue(raw)} />;
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
      <Toolbar
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: T.HEADER_GAP }}>
            <Button variant="ghost" label="← 返回" onClick={() => navigate(-1)} />
            <span
              style={{
                ...typeStyle(T.HEADER_KEY_TYPE),
                color: theme.text.primary,
                fontFamily: FONT_FAMILY.mono,
                fontVariantNumeric: NUMERIC_FONT_VARIANT,
              }}
            >
              {data?.issue.issueKey ?? issueId}
            </span>
          </div>
        }
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: T.SECTION_GAP,
          padding: `${T.PAGE_PADDING_Y}px ${T.PAGE_PADDING_X}px`,
        }}
      >
        {error !== undefined ? (
          <EmptyState
            icon="clock"
            title="載入工單失敗"
            description={error}
            action={{ label: '重試', onClick: () => void reload() }}
          />
        ) : loading && data === undefined ? (
          <span style={{ ...typeStyle(TYPE_STYLES.caption), color: theme.text.tertiary }}>載入中…</span>
        ) : data !== undefined ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: T.BODY_COLUMNS,
                gap: T.BODY_GAP,
                alignItems: 'start',
                minWidth: T.BODY_MIN_WIDTH,
              }}
            >
              <SectionPanel title="欄位">
                {singleFieldDefs.map((def) => (
                  <FieldRow key={def.name} label={def.label}>
                    {renderFieldValue(def)}
                  </FieldRow>
                ))}
                {fieldError !== undefined && (
                  <span style={{ ...typeStyle(T.FIELD_ERROR_TYPE), color: theme.status.error_fg }}>
                    {fieldError}
                  </span>
                )}
              </SectionPanel>

              <SectionPanel title="關聯">
                {relationsView === undefined || relationsView.isEmpty ? (
                  <EmptyState compact title="尚無關聯" description="這張工單目前沒有任何關聯。" />
                ) : (
                  <>
                    {(relationsView.parents.length > 0 || relationsView.children.length > 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: T.GROUP_STACK_GAP }}>
                        <span style={{ ...typeStyle(T.PANEL_TITLE_TYPE), color: theme.text.tertiary }}>
                          母子鏈
                        </span>
                        <RelationGroup title="上層" items={relationsView.parents} />
                        <RelationGroup title="子工單" items={relationsView.children} />
                      </div>
                    )}
                    {relationsView.otherGroups.map((group) => (
                      <RelationGroup key={group.relationTypeId} title={group.typeName} items={group.items} />
                    ))}
                  </>
                )}
              </SectionPanel>
            </div>

            <SectionPanel title="異動歷史">
              {data.changeLog.length === 0 ? (
                <EmptyState compact title="尚無異動記錄" description="這張工單目前沒有任何欄位異動。" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {data.changeLog.map((entry) => (
                    <ChangeLogRow
                      key={entry.id}
                      entry={entry}
                      fieldLabel={fieldLabelByName.get(entry.fieldName) ?? entry.fieldName}
                    />
                  ))}
                </div>
              )}
            </SectionPanel>
          </>
        ) : null}
      </div>
    </div>
  );
}
