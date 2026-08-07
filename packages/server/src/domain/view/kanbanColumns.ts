import type { IssueTypeWorkflow, KanbanColumn, WorkflowStateRef } from './types.js';

/**
 * 建構看板欄集合與欄序。
 * 對應 spec: ViewLogic / buildKanbanColumns。
 */
export function buildKanbanColumns(issueTypes: readonly IssueTypeWorkflow[]): KanbanColumn[] {
  const order: string[] = [];

  for (const issueType of issueTypes) {
    mergeStates(order, sortStates(issueType.states));
  }

  return order.map((name) => ({ name }));
}

/**
 * 把單一型別的狀態清單保序併入欄序。
 * 同名狀態合併為同一欄；新狀態插在最後一個已存在前驅之後，無前驅則插最前。
 */
function mergeStates(order: string[], states: readonly WorkflowStateRef[]): void {
  const predecessors: string[] = [];

  for (const state of states) {
    if (!order.includes(state.name)) {
      order.splice(lastPredecessorIndex(order, predecessors) + 1, 0, state.name);
    }
    predecessors.push(state.name);
  }
}

/** 前驅狀態在欄序中的最右位置；無前驅時回傳 -1，代表插最前。 */
function lastPredecessorIndex(order: readonly string[], predecessors: readonly string[]): number {
  return predecessors.reduce((rightmost, name) => Math.max(rightmost, order.indexOf(name)), -1);
}

/** 依 WorkflowStates.sortOrder 排序，不動輸入陣列。 */
function sortStates(states: readonly WorkflowStateRef[]): WorkflowStateRef[] {
  return [...states].sort((left, right) => left.sortOrder - right.sortOrder);
}
