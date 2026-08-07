// KanbanScreen · 看板畫面
//
// 角色：依 Status 分欄呈現工單，拖曳卡片完成狀態轉換。欄集合不隨結案原因
// 增加——結案原因是拖入終止欄時的一次選擇，不開欄。
//
// 來源：design git 的 `30_screens/no2_kanban_screen/no2_kanban_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no2_kanban_screen.md
// 引用的 Logic：applyViewFilter、buildKanbanColumns、filterViewByPermission、
//               getResolutionOptions、changeIssueStatus
//
// 消費元件：
//   gantt/Toolbar                     工具列容器，左中右三區
//   controls/Select、TextInput、Button、Chip
//   data/KanbanColumn、KanbanCard、FilterNotice、EmptyState
//   本檔私有的 KanbanDropSlot、KanbanResolutionPrompt 在 internal.tsx
//
// 與 design 的差異：
//   1. variant 不搬。canvas 的 dragging 與 resolution 是擺好的快照，
//      app 內兩者都由真實拖放產生：拖起卡片就出殘影與放置槽，
//      放進終止欄就跳結案原因浮層
//   2. 拖放走瀏覽器原生 HTML5 drag and drop。KanbanCard 已備 draggable 與
//      onDragStart / onDragEnd，KanbanColumn 已備 onDragOver / onDrop，
//      畫面只補狀態機
//   3. 篩選 chip 改為真實狀態的投影。design 的兩顆 chip 是示意標籤、移除後
//      什麼也不會變；此處 chip 對應搜尋字與非預設資料來源，移除即清掉該條件

import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';

import { Button, Chip, Select, TextInput } from '../../components/controls';
import { EmptyState, FilterNotice, KanbanCard, KanbanColumn } from '../../components/data';
import { Toolbar } from '../../components/gantt';
import { FONT_FAMILY, useTheme, withAlpha } from '../../theme';
import { typeStyle } from '../typeStyle';
import {
  buildKanbanColumns,
  KANBAN_DEFAULT_SOURCE,
  KANBAN_ISSUES,
  KANBAN_PERMISSION_FILTERED,
  KANBAN_RESOLUTIONS,
  KANBAN_SOURCES,
  kanbanSourceById,
  resolutionById,
} from './fixtures';
import type { KanbanIssue, KanbanSourceId } from './fixtures';
import { KanbanDropSlot, KanbanResolutionPrompt } from './internal';
import { KANBAN_SCREEN_TOKENS } from './tokens';

const K = KANBAN_SCREEN_TOKENS;

/** 拖入終止欄後、等結案原因的那一次放置。取消則什麼也不寫。 */
interface PendingClose {
  readonly issueKey: string;
  readonly columnId: string;
}

interface ActiveFilterChip {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onRemove: () => void;
}

export function KanbanScreen() {
  const { theme } = useTheme();

  // 工單本體。狀態轉換直接寫回這裡，接 API 後改為 changeIssueStatus 的回傳。
  const [issues, setIssues] = useState<readonly KanbanIssue[]>(KANBAN_ISSUES);
  const [source, setSource] = useState<KanbanSourceId>(KANBAN_DEFAULT_SOURCE);
  const [search, setSearch] = useState('');

  // 拖放狀態機。draggingKey 為被抬起的卡、dropColumnId 為游標當下所在的欄。
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);

  const sourceOption = kanbanSourceById(source);

  // 欄集合與欄序由 buildKanbanColumns 產出；資料來源涉及的型別是唯一輸入。
  const columns = useMemo(() => buildKanbanColumns(sourceOption.types), [sourceOption.types]);

  const visibleIssues = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return issues.filter((issue) => {
      if (!sourceOption.types.includes(issue.type)) return false;
      if (term === '') return true;
      return (
        issue.key.toLocaleLowerCase().includes(term) ||
        issue.title.toLocaleLowerCase().includes(term)
      );
    });
  }, [issues, sourceOption.types, search]);

  const pendingIssue = useMemo(
    () =>
      pendingClose === null
        ? undefined
        : issues.find((issue) => issue.key === pendingClose.issueKey),
    [issues, pendingClose],
  );
  const showPrompt = pendingClose !== null && pendingIssue !== undefined;

  // 已套用的篩選條件。兩顆 chip 都是真實狀態的投影，移除即清掉該條件。
  const chips: readonly ActiveFilterChip[] = [
    ...(search.trim() === ''
      ? []
      : [{ id: 'search', label: '搜尋', value: search.trim(), onRemove: () => setSearch('') }]),
    ...(source === KANBAN_DEFAULT_SOURCE
      ? []
      : [
          {
            id: 'source',
            label: '資料來源',
            value: sourceOption.label,
            onRemove: () => setSource(KANBAN_DEFAULT_SOURCE),
          },
        ]),
  ];

  /** changeIssueStatus 的畫面端投影：寫 Status，非終止狀態一併清掉 Resolution。 */
  const applyStatus = useCallback((issueKey: string, status: string, resolution?: string) => {
    setIssues((prev) =>
      prev.map((issue) => {
        if (issue.key !== issueKey) return issue;
        // 逐鍵重組而非展開後覆寫：非終止狀態要的是「沒有 Resolution 這個鍵」，
        // 不是 Resolution 為 undefined。
        return {
          key: issue.key,
          type: issue.type,
          title: issue.title,
          assignee: issue.assignee,
          status,
          ...(issue.due === undefined ? {} : { due: issue.due }),
          ...(resolution === undefined ? {} : { resolution }),
        };
      }),
    );
  }, []);

  const endDrag = useCallback(() => {
    setDraggingKey(null);
    setDropColumnId(null);
  }, []);

  const onCardDragStart = useCallback((issueKey: string, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', issueKey);
    setDraggingKey(issueKey);
  }, []);

  const onColumnDragOver = useCallback(
    (columnId: string, event: DragEvent<HTMLElement>) => {
      if (draggingKey === null) return;
      // preventDefault 才會觸發 drop；不擋預設的話瀏覽器一律視為不可放置。
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropColumnId !== columnId) setDropColumnId(columnId);
    },
    [draggingKey, dropColumnId],
  );

  const onColumnDrop = useCallback(
    (columnId: string, isTerminal: boolean, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const issueKey = draggingKey;
      endDrag();
      if (issueKey === null) return;
      const issue = issues.find((i) => i.key === issueKey);
      if (issue === undefined || issue.status === columnId) return;
      if (isTerminal) {
        setPendingClose({ issueKey, columnId });
        return;
      }
      applyStatus(issueKey, columnId);
    },
    [applyStatus, draggingKey, endDrag, issues],
  );

  const renderCard = (issue: KanbanIssue) => {
    const resolution = resolutionById(issue.resolution);
    return (
      <KanbanCard
        key={issue.key}
        issueKey={issue.key}
        title={issue.title}
        assignee={issue.assignee}
        // 終止欄的卡片改掛結案原因：Status 已由欄承載，卡上再標一次沒有資訊量，
        // Resolution 才是這一欄真正要看的狀態資訊。
        due={resolution === undefined ? issue.due : undefined}
        status={
          resolution === undefined ? undefined : { label: resolution.label, tone: resolution.tone }
        }
        ghost={draggingKey === issue.key}
        draggable
        onDragStart={(event) => onCardDragStart(issue.key, event)}
        onDragEnd={endDrag}
      />
    );
  };

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
      {/* 工具列：資料來源、搜尋與篩選 */}
      <Toolbar
        left={
          <>
            <span
              style={{
                ...typeStyle(K.VIEW_TITLE_TYPE),
                color: theme.text.primary,
                whiteSpace: 'nowrap',
              }}
            >
              工單看板
            </span>
            <Select
              prefix="資料來源"
              options={KANBAN_SOURCES}
              value={source}
              onChange={(value) => setSource(value as KanbanSourceId)}
            />
          </>
        }
        center={
          <TextInput
            leadingIcon="search"
            placeholder="搜尋工單編號或標題"
            value={search}
            onChange={setSearch}
            clearable
            style={{ width: K.SEARCH_WIDTH }}
          />
        }
        right={<Button variant="ghost" iconLeft="filter" label="篩選條件" />}
      />

      {/* 已套用篩選 + 合欄說明 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: K.FILTER_BAR_GAP,
          flexWrap: 'wrap',
          padding: `${K.FILTER_BAR_PADDING_Y}px ${K.PADDING_X}px`,
        }}
      >
        {chips.map((chip) => (
          <Chip key={chip.id} label={chip.label} value={chip.value} onRemove={chip.onRemove} />
        ))}
        <span
          style={{ marginLeft: 'auto', ...typeStyle(K.META_TYPE), color: theme.text.tertiary }}
        >
          {`資料來源含 ${sourceOption.types.length} 種型別，同名狀態合為同一欄 · 共 ${columns.length} 欄`}
        </span>
      </div>

      {/* 權限過濾標示：被濾筆數為 0 時 FilterNotice 自身不渲染 */}
      <div
        style={{
          padding: `0 ${K.PADDING_X}px`,
          marginBottom: KANBAN_PERMISSION_FILTERED > 0 ? K.NOTICE_MARGIN_BOTTOM : 0,
        }}
      >
        <FilterNotice count={KANBAN_PERMISSION_FILTERED} reason="無讀取權" />
      </div>

      {/* 看板欄區：依 Status 分欄，欄數不隨結案原因增加 */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          gap: K.BOARD_GAP,
          padding: `0 ${K.PADDING_X}px ${K.PADDING_BOTTOM}px`,
          overflowX: 'auto',
        }}
      >
        {showPrompt && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: K.Z_SCRIM,
              background: withAlpha(theme.shadow.color, K.SCRIM_OPACITY),
            }}
          />
        )}

        {columns.map((column) => {
          const cards = visibleIssues.filter((issue) => issue.status === column.id);
          const isDropTarget = draggingKey !== null && dropColumnId === column.id;
          const isPromptAnchor = showPrompt && pendingClose.columnId === column.id;
          return (
            <div
              key={column.id}
              style={{
                position: 'relative',
                flexShrink: 0,
                ...(isPromptAnchor ? { zIndex: K.Z_ANCHOR_COLUMN } : {}),
              }}
            >
              <KanbanColumn
                title={column.label}
                count={cards.length}
                isDropTarget={isDropTarget}
                maxHeight={K.COLUMN_BODY_MAX_HEIGHT}
                onDragOver={(event) => onColumnDragOver(column.id, event)}
                onDrop={(event) => onColumnDrop(column.id, column.isTerminal, event)}
              >
                {isDropTarget && <KanbanDropSlot label={`放到「${column.label}」`} />}
                {cards.length === 0 && !isDropTarget ? (
                  <EmptyState
                    compact
                    title="這一欄沒有工單"
                    description="拖曳其他欄的卡片進來，或調整篩選條件。"
                  />
                ) : (
                  cards.map(renderCard)
                )}
              </KanbanColumn>

              {/* 拖入終止欄：結案原因選擇 */}
              {isPromptAnchor && (
                <KanbanResolutionPrompt
                  issue={pendingIssue}
                  targetLabel={column.label}
                  options={KANBAN_RESOLUTIONS}
                  onCancel={() => setPendingClose(null)}
                  onConfirm={(resolutionId) => {
                    applyStatus(pendingClose.issueKey, pendingClose.columnId, resolutionId);
                    setPendingClose(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
