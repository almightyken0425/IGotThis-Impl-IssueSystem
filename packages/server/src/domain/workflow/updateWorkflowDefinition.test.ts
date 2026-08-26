import { describe, expect, it } from 'vitest';

import {
  checkExactlyOneInitialState,
  checkStateNamesUnique,
  checkTransitionStatesExist,
  validateWorkflowDefinitionEdit,
} from './updateWorkflowDefinition.js';
import type { WorkflowStateEdit, WorkflowTransitionEdit } from './types.js';

const states: readonly WorkflowStateEdit[] = [
  { name: '待處理', isInitial: true, isTerminal: false },
  { name: '處理中', isInitial: false, isTerminal: false },
  { name: '已關閉', isInitial: false, isTerminal: true },
];

const transitions: readonly WorkflowTransitionEdit[] = [
  { fromState: '待處理', toState: '處理中', requiredRole: null, requiredFields: [] },
  { fromState: '處理中', toState: '已關閉', requiredRole: '管理員', requiredFields: ['resolution'] },
];

describe('checkStateNamesUnique 狀態名稱檢查', () => {
  it('名稱皆不重複時放行', () => {
    expect(checkStateNamesUnique(states).ok).toBe(true);
  });

  it('名稱重複時擋下', () => {
    const result = checkStateNamesUnique([...states, { name: '待處理', isInitial: false, isTerminal: false }]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('STATE_NAME_DUPLICATE');
  });
});

describe('checkExactlyOneInitialState 起始狀態檢查', () => {
  it('恰好一個起始狀態時放行', () => {
    expect(checkExactlyOneInitialState(states).ok).toBe(true);
  });

  it('零個起始狀態時擋下', () => {
    const noInitial = states.map((s) => ({ ...s, isInitial: false }));
    const result = checkExactlyOneInitialState(noInitial);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('INITIAL_STATE_COUNT_INVALID');
  });

  it('多個起始狀態時擋下', () => {
    const twoInitial = states.map((s, i) => ({ ...s, isInitial: i < 2 }));
    const result = checkExactlyOneInitialState(twoInitial);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('INITIAL_STATE_COUNT_INVALID');
  });
});

describe('checkTransitionStatesExist 轉換狀態檢查', () => {
  it('轉換皆引用既有狀態時放行', () => {
    expect(checkTransitionStatesExist(states, transitions).ok).toBe(true);
  });

  it('轉換引用不存在的來源狀態時擋下', () => {
    const bad: readonly WorkflowTransitionEdit[] = [
      { fromState: '不存在', toState: '處理中', requiredRole: null, requiredFields: [] },
    ];
    const result = checkTransitionStatesExist(states, bad);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TRANSITION_STATE_NOT_FOUND');
  });

  it('轉換引用不存在的目標狀態時擋下', () => {
    const bad: readonly WorkflowTransitionEdit[] = [
      { fromState: '待處理', toState: '不存在', requiredRole: null, requiredFields: [] },
    ];
    const result = checkTransitionStatesExist(states, bad);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TRANSITION_STATE_NOT_FOUND');
  });
});

describe('validateWorkflowDefinitionEdit 綜合驗證', () => {
  it('全部通過時放行', () => {
    expect(validateWorkflowDefinitionEdit(states, transitions).ok).toBe(true);
  });

  it('依序短路：名稱重複優先於起始狀態數量', () => {
    const duplicated = [...states, { name: '待處理', isInitial: false, isTerminal: false }];
    const result = validateWorkflowDefinitionEdit(duplicated, transitions);
    expect(result.ok === false && result.code).toBe('STATE_NAME_DUPLICATE');
  });

  it('名稱與起始狀態皆合法但轉換引用不存在狀態時擋在最後一項', () => {
    const bad: readonly WorkflowTransitionEdit[] = [
      { fromState: '待處理', toState: '不存在', requiredRole: null, requiredFields: [] },
    ];
    const result = validateWorkflowDefinitionEdit(states, bad);
    expect(result.ok === false && result.code).toBe('TRANSITION_STATE_NOT_FOUND');
  });
});
