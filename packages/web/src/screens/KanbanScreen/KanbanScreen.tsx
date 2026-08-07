// KanbanScreen · 看板畫面
//
// 角色：依 Status 分欄呈現工單，拖曳卡片完成狀態轉換。欄集合由工作區各工單型別
// 的流程狀態聯集產出，不隨資料增減。
//
// 來源：design git 的 `30_screens/no2_kanban_screen/no2_kanban_screen.jsx`。
// 對側 spec：no3_product_specs/no1_issue_system/no2_screens/no2_kanban_screen.md
//
// 資料來源：改接真 API。欄由 /api/views/kanban-columns 取回，卡片由
// /api/workspace/issues 取回並依 status 欄位分欄；拖入他欄即 PATCH 該工單 status。
// design 的假資料、結案原因浮層與多資料來源不搬——單一工作區、狀態即欄。
//
// 消費元件：gantt/Toolbar、controls（TextInput / Button / Chip）、
//           data（KanbanColumn / KanbanCard / EmptyState），本檔私有 KanbanDropSlot。

import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';

import { workspaceApi } from '../../api';
import type { WorkspaceContext, WorkspaceIssue } from '../../api';
import { Button, Chip, TextInput } from '../../components/controls';
import { EmptyState, KanbanCard, KanbanColumn } from '../../components/data';
import type { DueTone } from '../../components/data';
import { Toolbar } from '../../components/gantt';
import { useAsync } from '../../hooks/useAsync';
import { FONT_FAMILY, useTheme } from '../../theme';
import { typeStyle } from '../typeStyle';
import { KanbanDropSlot } from './internal';
import { KANBAN_SCREEN_TOKENS } from './tokens';

const K = KANBAN_SCREEN_TOKENS;

const DAY_MS = 24 * 60 * 60 * 1000;

interface DueDisplay {
  readonly label: string;
  readonly tone?: DueTone;
}

/** ISO 到期日轉卡片顯示。過期 overdue、七日內 soon。 */
function dueDisplay(iso: string | null): DueDisplay | undefined {
  if (iso === null) return undefined;
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return { label: iso };
  const label = `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (diff < 0) return { label, tone: 'overdue' };
  if (diff <= 7) return { label, tone: 'soon' };
  return { label };
}

interface KanbanData {
  readonly context: WorkspaceContext;
  readonly columns: readonly string[];
  readonly issues: readonly WorkspaceIssue[];
}

export function KanbanScreen() {
  const { theme } = useTheme();

  const fetcher = useCallback(async (): Promise<KanbanData> => {
    const context = await workspaceApi.getWorkspace();
    const [columns, issues] = await Promise.all([
      workspaceApi.getKanbanColumns(),
      workspaceApi.listIssues(),
    ]);
    return { context, columns, issues };
  }, []);
  const { data, loading, error, reload } = useAsync(fetcher);

  const [search, setSearch] = useState('');
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const columns = data?.columns ?? [];
  const issues = data?.issues ?? [];

  const terminalSet = useMemo(
    () => new Set((data?.context.statuses ?? []).filter((s) => s.isTerminal).map((s) => s.name)),
    [data?.context.statuses],
  );

  const visibleIssues = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (term === '') return issues;
    return issues.filter(
      (issue) =>
        issue.key.toLocaleLowerCase().includes(term) ||
        issue.title.toLocaleLowerCase().includes(term),
    );
  }, [issues, search]);

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
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropColumnId !== columnId) setDropColumnId(columnId);
    },
    [draggingKey, dropColumnId],
  );

  const onColumnDrop = useCallback(
    async (columnId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const issueKey = draggingKey;
      endDrag();
      if (issueKey === null) return;
      const issue = issues.find((i) => i.key === issueKey);
      if (issue === undefined || issue.status === columnId) return;
      setPendingKey(issueKey);
      try {
        await workspaceApi.updateIssue(issue.id, { status: columnId });
        await reload();
      } finally {
        setPendingKey(null);
      }
    },
    [draggingKey, endDrag, issues, reload],
  );

  const chips = search.trim() === '' ? [] : [{ id: 'search', value: search.trim() }];

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
          <span
            style={{ ...typeStyle(K.VIEW_TITLE_TYPE), color: theme.text.primary, whiteSpace: 'nowrap' }}
          >
            工單看板
          </span>
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
        right={<Button variant="ghost" label="重新整理" onClick={() => void reload()} />}
      />

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
          <Chip key={chip.id} label="搜尋" value={chip.value} onRemove={() => setSearch('')} />
        ))}
        <span style={{ marginLeft: 'auto', ...typeStyle(K.META_TYPE), color: theme.text.tertiary }}>
          {`共 ${columns.length} 欄 · ${visibleIssues.length} 張工單`}
        </span>
      </div>

      {error !== undefined ? (
        <div style={{ padding: `0 ${K.PADDING_X}px` }}>
          <EmptyState
            icon="clock"
            title="載入看板失敗"
            description={error}
            action={{ label: '重試', onClick: () => void reload() }}
          />
        </div>
      ) : loading && data === undefined ? (
        <div style={{ padding: `0 ${K.PADDING_X}px`, ...typeStyle(K.META_TYPE), color: theme.text.tertiary }}>
          載入中…
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-start',
            gap: K.BOARD_GAP,
            padding: `0 ${K.PADDING_X}px ${K.PADDING_BOTTOM}px`,
            overflowX: 'auto',
          }}
        >
          {columns.map((columnId) => {
            const cards = visibleIssues.filter((issue) => issue.status === columnId);
            const isDropTarget = draggingKey !== null && dropColumnId === columnId;
            return (
              <div key={columnId} style={{ flexShrink: 0 }}>
                <KanbanColumn
                  title={columnId}
                  count={cards.length}
                  isDropTarget={isDropTarget}
                  maxHeight={K.COLUMN_BODY_MAX_HEIGHT}
                  onDragOver={(event) => onColumnDragOver(columnId, event)}
                  onDrop={(event) => void onColumnDrop(columnId, event)}
                >
                  {isDropTarget && <KanbanDropSlot label={`放到「${columnId}」`} />}
                  {cards.length === 0 && !isDropTarget ? (
                    <EmptyState compact title="這一欄沒有工單" description="拖曳其他欄的卡片進來。" />
                  ) : (
                    cards.map((issue) => (
                      <KanbanCard
                        key={issue.key}
                        issueKey={issue.key}
                        title={issue.title}
                        assignee={issue.assignee === '' ? undefined : issue.assignee}
                        due={terminalSet.has(issue.status) ? undefined : dueDisplay(issue.due)}
                        ghost={draggingKey === issue.key}
                        loading={pendingKey === issue.key}
                        draggable
                        onDragStart={(event) => onCardDragStart(issue.key, event)}
                        onDragEnd={endDrag}
                      />
                    ))
                  )}
                </KanbanColumn>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
