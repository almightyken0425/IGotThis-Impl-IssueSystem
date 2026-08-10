import { describe, expect, it } from 'vitest';

import { validateStatusTransition } from './validateStatusTransition.js';
import {
  checkActorRole,
  checkRequiredFieldsPresent,
  checkResolutionRequiredForTerminal,
  checkResolutionValueAllowed,
  checkTransitionAllowed,
} from './validateStatusTransition.js';
import type { StatusTransitionInput, WorkflowDefinition } from './types.js';

// 三狀態最小流程，比照 spec 的 StandardWorkflowStates／StandardWorkflowTransitions。
const definition: WorkflowDefinition = {
  states: [
    { name: '待處理', isTerminal: false },
    { name: '處理中', isTerminal: false },
    { name: '已完成', isTerminal: true },
  ],
  transitions: [
    { fromState: '待處理', toState: '處理中', requiredRole: null, requiredFields: [] },
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

describe('checkTransitionAllowed 轉換對檢查', () => {
  it('轉換對存在時放行', () => {
    const result = checkTransitionAllowed(baseInput());
    expect(result.ok).toBe(true);
  });

  it('轉換對不存在時擋下', () => {
    const result = checkTransitionAllowed(
      baseInput({ issue: { currentStatus: '待處理', fieldsWithValue: [] }, targetStatus: '已完成' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('目標與來源相同、無自迴圈定義時擋下', () => {
    const result = checkTransitionAllowed(
      baseInput({ issue: { currentStatus: '待處理', fieldsWithValue: [] }, targetStatus: '待處理' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('轉換清單為空時擋下', () => {
    const emptyDefinition: WorkflowDefinition = { ...definition, transitions: [] };
    const result = checkTransitionAllowed(baseInput({ definition: emptyDefinition }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TRANSITION_NOT_ALLOWED');
  });
});

describe('checkActorRole 角色檢查', () => {
  const withRole: WorkflowDefinition = {
    ...definition,
    transitions: [
      { fromState: '待處理', toState: '處理中', requiredRole: '主管', requiredFields: [] },
    ],
  };

  it('requiredRole 為 null 時任何執行者放行', () => {
    const result = checkActorRole(baseInput());
    expect(result.ok).toBe(true);
  });

  it('執行者持有所需角色時放行', () => {
    const result = checkActorRole(
      baseInput({ definition: withRole, actor: { roleNames: ['主管'] } }),
    );
    expect(result.ok).toBe(true);
  });

  it('執行者不持有所需角色時擋下', () => {
    const result = checkActorRole(
      baseInput({ definition: withRole, actor: { roleNames: ['成員'] } }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('ACTOR_ROLE_NOT_ALLOWED');
  });

  it('執行者持有多個角色、其中含所需角色時放行', () => {
    const result = checkActorRole(
      baseInput({ definition: withRole, actor: { roleNames: ['成員', '主管'] } }),
    );
    expect(result.ok).toBe(true);
  });

  it('轉換對不存在時本檢查獨立呼叫仍放行，把關屬 checkTransitionAllowed 職責', () => {
    const result = checkActorRole(
      baseInput({ definition: withRole, targetStatus: '已完成', actor: { roleNames: [] } }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('checkRequiredFieldsPresent 必填欄位檢查', () => {
  const withRequiredFields: WorkflowDefinition = {
    ...definition,
    transitions: [
      {
        fromState: '待處理',
        toState: '處理中',
        requiredRole: null,
        requiredFields: ['assignee', 'point'],
      },
    ],
  };

  it('空必填清單放行', () => {
    const result = checkRequiredFieldsPresent(baseInput());
    expect(result.ok).toBe(true);
  });

  it('必填欄位皆有值放行', () => {
    const result = checkRequiredFieldsPresent(
      baseInput({
        definition: withRequiredFields,
        issue: { currentStatus: '待處理', fieldsWithValue: ['assignee', 'point'] },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('缺一個必填欄位時擋下，reason 含欄位名', () => {
    const result = checkRequiredFieldsPresent(
      baseInput({
        definition: withRequiredFields,
        issue: { currentStatus: '待處理', fieldsWithValue: ['assignee'] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('REQUIRED_FIELDS_MISSING');
    expect(result.ok === false && result.reason).toContain('point');
  });

  it('缺多個必填欄位時 reason 只列真正缺的那些', () => {
    const result = checkRequiredFieldsPresent(
      baseInput({
        definition: withRequiredFields,
        issue: { currentStatus: '待處理', fieldsWithValue: [] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('assignee');
    expect(result.ok === false && result.reason).toContain('point');
  });
});

describe('checkResolutionRequiredForTerminal 終止狀態結案原因檢查', () => {
  it('終止狀態未提供結案原因時擋下', () => {
    const result = checkResolutionRequiredForTerminal(
      baseInput({
        issue: { currentStatus: '處理中', fieldsWithValue: [] },
        targetStatus: '已完成',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('RESOLUTION_REQUIRED');
  });

  it('提供空字串視同未提供，擋下', () => {
    const result = checkResolutionRequiredForTerminal(
      baseInput({
        issue: { currentStatus: '處理中', fieldsWithValue: [] },
        targetStatus: '已完成',
        resolution: '',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('RESOLUTION_REQUIRED');
  });

  it('終止狀態且已提供結案原因時放行', () => {
    const result = checkResolutionRequiredForTerminal(
      baseInput({
        issue: { currentStatus: '處理中', fieldsWithValue: [] },
        targetStatus: '已完成',
        resolution: '已完成',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('非終止狀態未提供結案原因時放行', () => {
    const result = checkResolutionRequiredForTerminal(baseInput());
    expect(result.ok).toBe(true);
  });
});

describe('checkResolutionValueAllowed 結案原因合法性檢查', () => {
  it('未提供結案原因時不檢查、放行', () => {
    const result = checkResolutionValueAllowed(baseInput());
    expect(result.ok).toBe(true);
  });

  it('提供且在選項清單內放行', () => {
    const result = checkResolutionValueAllowed(baseInput({ resolution: '已完成' }));
    expect(result.ok).toBe(true);
  });

  it('提供但不在選項清單內擋下', () => {
    const result = checkResolutionValueAllowed(baseInput({ resolution: '不存在的原因' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('RESOLUTION_NOT_ALLOWED');
  });

  it('非終止轉換仍帶不合法結案原因時一樣擋下，本檢查不看是否終止', () => {
    const result = checkResolutionValueAllowed(
      baseInput({ targetStatus: '處理中', resolution: '不存在的原因' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('RESOLUTION_NOT_ALLOWED');
  });
});

describe('validateStatusTransition 檢查串接', () => {
  it('全過放行，非終止轉換', () => {
    const result = validateStatusTransition(baseInput());
    expect(result.ok).toBe(true);
  });

  it('全過放行，終止轉換加合法結案原因', () => {
    const result = validateStatusTransition(
      baseInput({
        issue: { currentStatus: '處理中', fieldsWithValue: [] },
        targetStatus: '已完成',
        resolution: '已完成',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('轉換不允許時優先回 TRANSITION_NOT_ALLOWED，即便其他條件也會失敗', () => {
    const withRole: WorkflowDefinition = {
      ...definition,
      transitions: [
        { fromState: '待處理', toState: '處理中', requiredRole: '主管', requiredFields: ['x'] },
      ],
    };
    const result = validateStatusTransition(
      baseInput({ definition: withRole, targetStatus: '已完成' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('角色不符優先於必填欄位檢查', () => {
    const withBoth: WorkflowDefinition = {
      ...definition,
      transitions: [
        { fromState: '待處理', toState: '處理中', requiredRole: '主管', requiredFields: ['x'] },
      ],
    };
    const result = validateStatusTransition(
      baseInput({ definition: withBoth, actor: { roleNames: [] } }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('ACTOR_ROLE_NOT_ALLOWED');
  });

  it('必填欄位缺值優先於終止結案原因檢查', () => {
    const withRequired: WorkflowDefinition = {
      states: definition.states,
      resolutionOptions: definition.resolutionOptions,
      transitions: [
        { fromState: '處理中', toState: '已完成', requiredRole: null, requiredFields: ['x'] },
      ],
    };
    const result = validateStatusTransition(
      baseInput({
        definition: withRequired,
        issue: { currentStatus: '處理中', fieldsWithValue: [] },
        targetStatus: '已完成',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('REQUIRED_FIELDS_MISSING');
  });

  it('終止缺結案原因回 RESOLUTION_REQUIRED', () => {
    const result = validateStatusTransition(
      baseInput({ issue: { currentStatus: '處理中', fieldsWithValue: [] }, targetStatus: '已完成' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('RESOLUTION_REQUIRED');
  });

  it('結案原因不合法時回 RESOLUTION_NOT_ALLOWED，前面檢查皆過的唯一剩餘路徑', () => {
    const result = validateStatusTransition(
      baseInput({
        issue: { currentStatus: '處理中', fieldsWithValue: [] },
        targetStatus: '已完成',
        resolution: '不存在的原因',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('RESOLUTION_NOT_ALLOWED');
  });
});
