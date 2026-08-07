// KanbanScreen · 假資料與檢視設定
//
// 來源：design git 的 `30_screens/no2_kanban_screen/no2_kanban_screen.jsx` 內
// KANBAN_SCREEN_TYPES / KANBAN_SCREEN_RESOLUTIONS / KANBAN_SCREEN_ISSUES /
// KANBAN_SCREEN_SOURCES 四組，加上 KS_buildKanbanColumns。
//
// 接 API 時只替換本檔。對應的伺服器端產出：
//   KANBAN_TYPES              各工單型別的 WorkflowStates，順序即 sortOrder
//   KANBAN_RESOLUTIONS        getResolutionOptions 的產出
//   KANBAN_ISSUES             applyViewFilter + filterViewByPermission 的產出
//   KANBAN_PERMISSION_FILTERED filterViewByPermission 濾掉的筆數
//   buildKanbanColumns        同名 Logic，屆時改由伺服器回欄集合、本函式撤除
//
// design 端的 KANBAN_SCREEN_VARIANT_CONFIG 不搬：dragging 與 resolution 兩個
// variant 在 app 內是真的拖放產生的狀態，不需要預先擺好的快照。

import type { StatusTone } from '../../components/data';

// ─── 工單型別與流程狀態 ──────────────────────────────────────
// 各型別的狀態清單，順序即 WorkflowStates.sortOrder。
// isTerminal 只掛在終止狀態上，看板據此判斷拖入時要不要問結案原因。

export type KanbanTypeId = 'dev' | 'bug' | 'spec';

export interface KanbanTypeDefinition {
  readonly id: KanbanTypeId;
  readonly label: string;
  readonly states: readonly string[];
}

export const KANBAN_TYPES: { readonly [K in KanbanTypeId]: KanbanTypeDefinition } = {
  dev: { id: 'dev', label: '開發', states: ['待處理', '處理中', '待驗收', '已關閉'] },
  bug: { id: 'bug', label: '缺陷', states: ['待處理', '處理中', '已關閉'] },
  spec: { id: 'spec', label: '規格', states: ['待處理', '待審查', '處理中', '已關閉'] },
};

export const KANBAN_TERMINAL_STATE = '已關閉';

// ─── 結案原因 ────────────────────────────────────────────────
// getResolutionOptions 的產出。結案原因隨型別各一份，本畫面示意用開發型別那份。
// tone 省略即中性 badge。

export interface KanbanResolution {
  readonly id: string;
  readonly label: string;
  readonly tone?: StatusTone;
}

export const KANBAN_RESOLUTIONS: readonly KanbanResolution[] = [
  { id: 'done', label: '已完成', tone: 'success' },
  { id: 'wontfix', label: '不做' },
  { id: 'duplicate', label: '重複' },
  { id: 'cantrepro', label: '無法重現', tone: 'warning' },
];

export function resolutionById(id: string | undefined): KanbanResolution | undefined {
  if (id === undefined) return undefined;
  return KANBAN_RESOLUTIONS.find((r) => r.id === id);
}

// ─── 工單 ────────────────────────────────────────────────────
// status 對應欄；resolution 只有終止狀態的工單才有。

export interface KanbanDue {
  readonly label: string;
  readonly tone?: 'overdue' | 'soon';
}

export interface KanbanIssue {
  readonly key: string;
  readonly type: KanbanTypeId;
  readonly status: string;
  readonly title: string;
  readonly assignee: string;
  readonly due?: KanbanDue;
  readonly resolution?: string;
}

export const KANBAN_ISSUES: readonly KanbanIssue[] = [
  { key: 'DEV-241', type: 'dev', status: '待處理', title: '看板拖曳釋放後的狀態寫入', assignee: '陳彥廷', due: { label: '08/12', tone: 'soon' } },
  { key: 'BUG-88', type: 'bug', status: '待處理', title: '篩選條件清空後工具列仍殘留 chip', assignee: '林珮瑜', due: { label: '08/08', tone: 'overdue' } },
  { key: 'DEV-247', type: 'dev', status: '待處理', title: '檢視欄位顯示設定的持久化', assignee: '黃俊翔', due: { label: '08/21' } },
  { key: 'SPEC-31', type: 'spec', status: '待處理', title: '工單集分享對象的權限矩陣', assignee: '蘇曉萱', due: { label: '08/19' } },

  { key: 'DEV-238', type: 'dev', status: '處理中', title: '結案原因選單接 getResolutionOptions', assignee: '陳彥廷', due: { label: '08/09', tone: 'soon' } },
  { key: 'BUG-91', type: 'bug', status: '處理中', title: '權限濾除筆數與實際被濾工單不符', assignee: '林珮瑜', due: { label: '08/07', tone: 'overdue' } },
  { key: 'DEV-244', type: 'dev', status: '處理中', title: '甘特列高與主題單列高不對齊', assignee: '黃俊翔', due: { label: '08/15' } },
  { key: 'SPEC-27', type: 'spec', status: '處理中', title: '日曆與工作日定義的欄位邊界', assignee: '蘇曉萱', due: { label: '08/14' } },

  { key: 'DEV-233', type: 'dev', status: '待驗收', title: '工單編號流水序跨型別重複', assignee: '陳彥廷', due: { label: '08/11', tone: 'soon' } },
  { key: 'DEV-229', type: 'dev', status: '待驗收', title: '狀態轉換禁止原因的回傳承載格式', assignee: '黃俊翔', due: { label: '08/18' } },

  { key: 'DEV-225', type: 'dev', status: '已關閉', title: '看板欄集合改由型別狀態聯集產出', assignee: '陳彥廷', resolution: 'done' },
  { key: 'BUG-84', type: 'bug', status: '已關閉', title: '深色主題下 badge 文字對比不足', assignee: '林珮瑜', resolution: 'done' },
  { key: 'DEV-218', type: 'dev', status: '已關閉', title: '看板依結案原因分欄', assignee: '黃俊翔', resolution: 'wontfix' },
  { key: 'BUG-79', type: 'bug', status: '已關閉', title: '拖曳把手在 Safari 無反應', assignee: '蘇曉萱', resolution: 'duplicate' },
];

/** 被權限濾除的筆數。這些工單不在 KANBAN_ISSUES 內，伺服器端就不回傳。 */
export const KANBAN_PERMISSION_FILTERED = 3;

// ─── 資料來源 ────────────────────────────────────────────────
// 檢視的 sourceMgmtIds 選什麼，就決定涉及哪些工單型別，型別集合再決定欄集合
// ——本畫面「換資料來源會換欄數」的因果鏈起點。

export type KanbanSourceId = 'quarter' | 'all' | 'mine';

export interface KanbanSourceOption {
  readonly value: KanbanSourceId;
  readonly label: string;
  readonly types: readonly KanbanTypeId[];
}

export const KANBAN_SOURCES: readonly KanbanSourceOption[] = [
  { value: 'quarter', label: '本季開發（開發 + 缺陷）', types: ['dev', 'bug'] },
  { value: 'all', label: '全產品（開發 + 缺陷 + 規格）', types: ['dev', 'bug', 'spec'] },
  { value: 'mine', label: '我追蹤的工單', types: ['dev'] },
];

export const KANBAN_DEFAULT_SOURCE: KanbanSourceId = 'quarter';

export function kanbanSourceById(id: KanbanSourceId): KanbanSourceOption {
  const found = KANBAN_SOURCES.find((s) => s.value === id);
  // 選項清單與 id 同源，找不到只可能是清單被改壞。
  if (found === undefined) throw new Error(`未知的看板資料來源：${id}`);
  return found;
}

// ─── 欄集合 ──────────────────────────────────────────────────

export interface KanbanColumnDefinition {
  readonly id: string;
  readonly label: string;
  readonly isTerminal: boolean;
}

/**
 * buildKanbanColumns 的看板端讀法。
 *
 * 依 spec：多型別時取各型別狀態清單的聯集、同名狀態合併為同一欄、重複狀態取
 * 最先出現的位置。新狀態的插入位置 spec 未明寫，此處採「插在第一個已存在的
 * 後繼狀態之前」，保序合併——否則規格型別的「待審查」會被推到「已關閉」之後、
 * 終止欄不在末位。
 */
export function buildKanbanColumns(
  typeIds: readonly KanbanTypeId[],
): readonly KanbanColumnDefinition[] {
  const order: string[] = [];
  typeIds.forEach((typeId) => {
    const states = KANBAN_TYPES[typeId].states;
    states.forEach((state, index) => {
      if (order.includes(state)) return;
      const successor = states.slice(index + 1).find((s) => order.includes(s));
      const at = successor === undefined ? order.length : order.indexOf(successor);
      order.splice(at, 0, state);
    });
  });
  return order.map((label) => ({
    id: label,
    label,
    isTerminal: label === KANBAN_TERMINAL_STATE,
  }));
}
