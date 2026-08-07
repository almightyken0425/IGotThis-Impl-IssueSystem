import { describe, expect, it } from 'vitest';

import {
  checkAcyclicConstraint,
  checkExclusiveConstraint,
  checkIssueSetBoundary,
  validateRelationCreation,
} from './relationIntegrity.js';
import type { RelationTypeRules } from './types.js';

// Children 的開關組合取自 Spec 的標準關聯型別表：獨佔、禁環、有序皆為真。
const childrenType: RelationTypeRules = {
  id: 'rt-children',
  name: 'Children',
  exclusive: true,
  acyclic: true,
};

describe('checkExclusiveConstraint 獨佔檢查', () => {
  it('被指端已被其他持有端指到時擋下', () => {
    const result = checkExclusiveConstraint({
      candidate: { fromIssueId: 'issue-b', toIssueId: 'issue-c', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-a', toIssueId: 'issue-c', relationTypeId: 'rt-children' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('exclusive_target_already_held');
  });
});

describe('checkExclusiveConstraint 獨佔開關為假', () => {
  // Before 的獨佔為假，同一被指端允許多個持有端。
  const beforeType: RelationTypeRules = {
    id: 'rt-before',
    name: 'Before',
    exclusive: false,
    acyclic: true,
  };

  it('被指端已被其他持有端指到仍放行', () => {
    const result = checkExclusiveConstraint({
      candidate: { fromIssueId: 'issue-b', toIssueId: 'issue-c', relationTypeId: 'rt-before' },
      relationType: beforeType,
      existingRelations: [
        { fromIssueId: 'issue-a', toIssueId: 'issue-c', relationTypeId: 'rt-before' },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

describe('checkExclusiveConstraint 邊界', () => {
  it('關聯表為空時放行', () => {
    const result = checkExclusiveConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [],
    });

    expect(result.ok).toBe(true);
  });

  it('被指端只被其他型別指到時放行', () => {
    const result = checkExclusiveConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-c', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-x', toIssueId: 'issue-c', relationTypeId: 'rt-container' },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('同一持有端指多個不同被指端時放行', () => {
    const result = checkExclusiveConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-c', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

describe('checkAcyclicConstraint 禁環檢查', () => {
  it('被指端一步可達持有端時擋下', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-b', toIssueId: 'issue-a', relationTypeId: 'rt-children' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('acyclic_would_form_cycle');
  });
});

describe('checkAcyclicConstraint 多步可達', () => {
  it('被指端經三段關聯可達持有端時擋下', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-b', toIssueId: 'issue-c', relationTypeId: 'rt-children' },
        { fromIssueId: 'issue-c', toIssueId: 'issue-d', relationTypeId: 'rt-children' },
        { fromIssueId: 'issue-d', toIssueId: 'issue-a', relationTypeId: 'rt-children' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('acyclic_would_form_cycle');
  });

  // Spec：可達性判斷含零步，持有端等於被指端視為成環。
  it('持有端等於被指端時擋下', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-a', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('acyclic_would_form_cycle');
  });
});

describe('checkAcyclicConstraint 禁環開關為假', () => {
  // RelatedTo 的禁環為假，成環不擋。
  const relatedToType: RelationTypeRules = {
    id: 'rt-related',
    name: 'RelatedTo',
    exclusive: false,
    acyclic: false,
  };

  it('被指端可達持有端仍放行', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-related' },
      relationType: relatedToType,
      existingRelations: [
        { fromIssueId: 'issue-b', toIssueId: 'issue-a', relationTypeId: 'rt-related' },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

describe('checkAcyclicConstraint 邊界', () => {
  it('關聯表為空且持有端與被指端相異時放行', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [],
    });

    expect(result.ok).toBe(true);
  });

  it('被指端的下游不含持有端時放行', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-b', toIssueId: 'issue-c', relationTypeId: 'rt-children' },
        { fromIssueId: 'issue-c', toIssueId: 'issue-d', relationTypeId: 'rt-children' },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('回路只存在於其他型別時放行', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-b', toIssueId: 'issue-a', relationTypeId: 'rt-related' },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('既有資料本身已成環時不無限走訪，仍給出判定', () => {
    const result = checkAcyclicConstraint({
      candidate: { fromIssueId: 'issue-z', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-b', toIssueId: 'issue-c', relationTypeId: 'rt-children' },
        { fromIssueId: 'issue-c', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

describe('checkIssueSetBoundary 母子邊界檢查', () => {
  it('Children 的持有端與被指端分屬不同工單集時擋下', () => {
    const result = checkIssueSetBoundary({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      issues: [
        { id: 'issue-a', issueSetId: 'set-1' },
        { id: 'issue-b', issueSetId: 'set-2' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('children_crosses_issue_set');
  });
});

describe('checkIssueSetBoundary 非 Children 型別', () => {
  // Container 是主題綁定，主題單本來就跨工單集綁定成員。
  const containerType: RelationTypeRules = {
    id: 'rt-container',
    name: 'Container',
    exclusive: true,
    acyclic: true,
  };

  it('Container 跨工單集時放行', () => {
    const result = checkIssueSetBoundary({
      candidate: { fromIssueId: 'issue-t', toIssueId: 'issue-b', relationTypeId: 'rt-container' },
      relationType: containerType,
      issues: [
        { id: 'issue-t', issueSetId: 'set-container' },
        { id: 'issue-b', issueSetId: 'set-2' },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

describe('checkIssueSetBoundary 邊界', () => {
  it('Children 的兩端同工單集時放行', () => {
    const result = checkIssueSetBoundary({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      issues: [
        { id: 'issue-a', issueSetId: 'set-1' },
        { id: 'issue-b', issueSetId: 'set-1' },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('查不到被指端所屬工單集時擋下', () => {
    const result = checkIssueSetBoundary({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      issues: [{ id: 'issue-a', issueSetId: 'set-1' }],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('issue_location_unknown');
  });

  it('工單清單為空時擋下', () => {
    const result = checkIssueSetBoundary({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      issues: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('issue_location_unknown');
  });
});

describe('validateRelationCreation 檢查串接', () => {
  it('三項檢查全過時放行', () => {
    const result = validateRelationCreation({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [],
      issues: [
        { id: 'issue-a', issueSetId: 'set-1' },
        { id: 'issue-b', issueSetId: 'set-1' },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('獨佔與母子邊界同時違反時回獨佔失敗，依 Spec 的檢查順序中止', () => {
    const result = validateRelationCreation({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [
        { fromIssueId: 'issue-x', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      ],
      issues: [
        { id: 'issue-a', issueSetId: 'set-1' },
        { id: 'issue-b', issueSetId: 'set-2' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('exclusive_target_already_held');
  });

  it('僅禁環違反時回禁環失敗', () => {
    const result = validateRelationCreation({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-before' },
      relationType: { id: 'rt-before', name: 'Before', exclusive: false, acyclic: true },
      existingRelations: [
        { fromIssueId: 'issue-b', toIssueId: 'issue-a', relationTypeId: 'rt-before' },
      ],
      issues: [
        { id: 'issue-a', issueSetId: 'set-1' },
        { id: 'issue-b', issueSetId: 'set-2' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('acyclic_would_form_cycle');
  });

  it('僅母子邊界違反時回邊界失敗', () => {
    const result = validateRelationCreation({
      candidate: { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: 'rt-children' },
      relationType: childrenType,
      existingRelations: [],
      issues: [
        { id: 'issue-a', issueSetId: 'set-1' },
        { id: 'issue-b', issueSetId: 'set-2' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('children_crosses_issue_set');
  });
});
