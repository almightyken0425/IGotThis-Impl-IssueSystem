import { describe, expect, it } from 'vitest';

import { changeIssueStatus } from './changeIssueStatus.js';
import type { StatusTransitionInput, WorkflowDefinition } from './types.js';

const definition: WorkflowDefinition = {
  states: [
    { name: '待處理', isTerminal: false },
    { name: '處理中', isTerminal: false },
    { name: '已完成', isTerminal: true },
  ],
  transitions: [
    { fromState: '待處理', toState: '處理中', requiredRole: null, requiredFields: ['assignee'] },
    { fromState: '處理中', toState: '已完成', requiredRole: null, requiredFields: [] },
  ],
  resolutionOptions: [{ value: '已完成' }, { value: '不做' }],
};

function baseInput(overrides: Partial<StatusTransitionInput> = {}): StatusTransitionInput {
  return {
    definition,
    issue: { currentStatus: '待處理', fieldsWithValue: [] },
    targetStatus: '處理中',
    actor: { roleNames: [] },
    ...overrides,
  };
}

describe('changeIssueStatus', () => {
  it('驗證失敗時原樣透傳失敗結果，證明委派完整邏輯而非只複製第一步', () => {
    const result = changeIssueStatus(baseInput({ issue: { currentStatus: '待處理', fieldsWithValue: [] } }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('REQUIRED_FIELDS_MISSING');
  });

  it('非終止轉換驗證通過時回傳目標狀態，resolution 為 undefined', () => {
    const result = changeIssueStatus(
      baseInput({ issue: { currentStatus: '待處理', fieldsWithValue: ['assignee'] } }),
    );
    expect(result).toEqual({ ok: true, status: '處理中', resolution: undefined });
  });

  it('終止轉換驗證通過且提供合法結案原因時一併回傳結案原因', () => {
    const result = changeIssueStatus(
      baseInput({
        issue: { currentStatus: '處理中', fieldsWithValue: [] },
        targetStatus: '已完成',
        resolution: '已完成',
      }),
    );
    expect(result).toEqual({ ok: true, status: '已完成', resolution: '已完成' });
  });
});
