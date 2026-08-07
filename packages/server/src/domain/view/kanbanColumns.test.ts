import { describe, expect, it } from 'vitest';

import { buildKanbanColumns } from './kanbanColumns.js';
import type { IssueTypeWorkflow } from './types.js';

describe('buildKanbanColumns', () => {
  it('單一型別的欄序依 sortOrder，與輸入順序無關', () => {
    const columns = buildKanbanColumns([
      issueType('bug', [
        { name: '已關閉', sortOrder: 3 },
        { name: '待處理', sortOrder: 1 },
        { name: '處理中', sortOrder: 2 },
      ]),
    ]);

    expect(names(columns)).toEqual(['待處理', '處理中', '已關閉']);
  });

  it('無工單型別時無欄', () => {
    expect(buildKanbanColumns([])).toEqual([]);
  });

  it('型別的狀態清單為空時不貢獻任何欄', () => {
    expect(buildKanbanColumns([issueType('empty', [])])).toEqual([]);
    expect(
      names(
        buildKanbanColumns([issueType('empty', []), issueType('bug', [state('待處理', 1)])]),
      ),
    ).toEqual(['待處理']);
  });

  it('單一狀態的型別產出單一欄', () => {
    expect(names(buildKanbanColumns([issueType('bug', [state('待處理', 1)])]))).toEqual(['待處理']);
  });

  // 取自 spec ViewLogic / buildKanbanColumns 的範例。
  it('新狀態插在最後一個已存在前驅之後，不附加到終止狀態之後', () => {
    const columns = buildKanbanColumns([
      issueType('base', [
        state('待處理', 1),
        state('處理中', 2),
        state('待驗收', 3),
        state('已關閉', 4),
      ]),
      issueType('incoming', [state('待處理', 1), state('待審查', 2), state('已關閉', 3)]),
    ]);

    expect(names(columns)).toEqual(['待處理', '待審查', '處理中', '待驗收', '已關閉']);
  });

  it('無已存在前驅的新狀態插在欄序最前，且彼此保持原順序', () => {
    const columns = buildKanbanColumns([
      issueType('base', [state('待處理', 1), state('已關閉', 2)]),
      issueType('incoming', [state('待評估', 1), state('已排程', 2), state('待處理', 3)]),
    ]);

    expect(names(columns)).toEqual(['待評估', '已排程', '待處理', '已關閉']);
  });

  it('狀態清單完全相同的型別不產生重複欄', () => {
    const states = [state('待處理', 1), state('已關閉', 2)];
    const columns = buildKanbanColumns([issueType('a', states), issueType('b', states)]);

    expect(names(columns)).toEqual(['待處理', '已關閉']);
  });

  it('三個型別逐一併入，後併入者仍保序', () => {
    const columns = buildKanbanColumns([
      issueType('a', [state('待處理', 1), state('已關閉', 2)]),
      issueType('b', [state('待處理', 1), state('開發中', 2), state('已關閉', 3)]),
      issueType('c', [state('開發中', 1), state('待測試', 2), state('已關閉', 3)]),
    ]);

    expect(names(columns)).toEqual(['待處理', '開發中', '待測試', '已關閉']);
  });

  it('前驅取欄序中最右者，確保新欄排在全部前驅之後', () => {
    // 基底型別把 B 排在 A 之前；併入型別的 A、B 順序相反。
    // X 的前驅是 A 與 B，取欄序中較右的 A，X 落在 A 之後而非 B 之後。
    const columns = buildKanbanColumns([
      issueType('base', [state('B', 1), state('A', 2), state('C', 3)]),
      issueType('incoming', [state('A', 1), state('B', 2), state('X', 3)]),
    ]);

    expect(names(columns)).toEqual(['B', 'A', 'X', 'C']);
  });

  it('sortOrder 相同時維持輸入順序，負數與跳號皆依數值排序', () => {
    const columns = buildKanbanColumns([
      issueType('bug', [
        { name: '收尾', sortOrder: 100 },
        { name: '並列甲', sortOrder: 5 },
        { name: '並列乙', sortOrder: 5 },
        { name: '起頭', sortOrder: -10 },
      ]),
    ]);

    expect(names(columns)).toEqual(['起頭', '並列甲', '並列乙', '收尾']);
  });

  it('不改動輸入的狀態清單', () => {
    const baseStates = [state('已關閉', 2), state('待處理', 1)];
    const incomingStates = [state('待處理', 1), state('待審查', 2)];
    const issueTypes = [issueType('base', baseStates), issueType('incoming', incomingStates)];

    buildKanbanColumns(issueTypes);

    expect(baseStates).toEqual([state('已關閉', 2), state('待處理', 1)]);
    expect(incomingStates).toEqual([state('待處理', 1), state('待審查', 2)]);
  });
});

function issueType(
  issueTypeId: string,
  states: readonly { name: string; sortOrder: number }[],
): IssueTypeWorkflow {
  return { issueTypeId, states };
}

function state(name: string, sortOrder: number) {
  return { name, sortOrder };
}

function names(columns: readonly { name: string }[]): string[] {
  return columns.map((column) => column.name);
}
