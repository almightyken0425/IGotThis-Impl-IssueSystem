import { describe, expect, it } from 'vitest';

import { switchDisplayLevel } from './switchDisplayLevel.js';
import type { RelationCandidate } from './types.js';

const CHILDREN_TYPE_ID = 'rt-children';
const CONTAINER_TYPE_ID = 'rt-container';

describe('switchDisplayLevel', () => {
  it('單一 Container 起點：起點本身為第一層', () => {
    const relations: RelationCandidate[] = [
      { fromIssueId: 'topic', toIssueId: 'root', relationTypeId: CONTAINER_TYPE_ID },
    ];

    const result = switchDisplayLevel({
      candidateIssueIds: ['root'],
      relations,
      childrenRelationTypeId: CHILDREN_TYPE_ID,
      targetLevel: 1,
    });

    expect(result).toEqual(['root']);
  });

  it('Children 三層鏈：逐層 targetLevel 篩出對應工單', () => {
    const relations: RelationCandidate[] = [
      { fromIssueId: 'topic', toIssueId: 'root', relationTypeId: CONTAINER_TYPE_ID },
      { fromIssueId: 'root', toIssueId: 'mid', relationTypeId: CHILDREN_TYPE_ID },
      { fromIssueId: 'mid', toIssueId: 'leaf', relationTypeId: CHILDREN_TYPE_ID },
    ];
    const candidateIssueIds = ['root', 'mid', 'leaf'];

    const byLevel = (targetLevel: number) =>
      switchDisplayLevel({
        candidateIssueIds,
        relations,
        childrenRelationTypeId: CHILDREN_TYPE_ID,
        targetLevel,
      });

    expect(byLevel(1)).toEqual(['root']);
    expect(byLevel(2)).toEqual(['mid']);
    expect(byLevel(3)).toEqual(['leaf']);
  });

  it('同一主題單多個 Container 起點：各自的層級獨立計算，不互相干擾', () => {
    const relations: RelationCandidate[] = [
      { fromIssueId: 'topic', toIssueId: 'root-a', relationTypeId: CONTAINER_TYPE_ID },
      { fromIssueId: 'topic', toIssueId: 'root-b', relationTypeId: CONTAINER_TYPE_ID },
      { fromIssueId: 'root-a', toIssueId: 'child-a', relationTypeId: CHILDREN_TYPE_ID },
    ];
    const candidateIssueIds = ['root-a', 'root-b', 'child-a'];

    const level1 = switchDisplayLevel({
      candidateIssueIds,
      relations,
      childrenRelationTypeId: CHILDREN_TYPE_ID,
      targetLevel: 1,
    });
    const level2 = switchDisplayLevel({
      candidateIssueIds,
      relations,
      childrenRelationTypeId: CHILDREN_TYPE_ID,
      targetLevel: 2,
    });

    expect(level1.slice().sort()).toEqual(['root-a', 'root-b']);
    expect(level2).toEqual(['child-a']);
  });

  it('targetLevel 超出候選集的最深層級：回空陣列', () => {
    const relations: RelationCandidate[] = [
      { fromIssueId: 'topic', toIssueId: 'root', relationTypeId: CONTAINER_TYPE_ID },
    ];

    const result = switchDisplayLevel({
      candidateIssueIds: ['root'],
      relations,
      childrenRelationTypeId: CHILDREN_TYPE_ID,
      targetLevel: 5,
    });

    expect(result).toEqual([]);
  });

  it('targetLevel 為 0 或負數：回空陣列，不擲錯', () => {
    const relations: RelationCandidate[] = [
      { fromIssueId: 'topic', toIssueId: 'root', relationTypeId: CONTAINER_TYPE_ID },
    ];

    expect(
      switchDisplayLevel({
        candidateIssueIds: ['root'],
        relations,
        childrenRelationTypeId: CHILDREN_TYPE_ID,
        targetLevel: 0,
      }),
    ).toEqual([]);
    expect(
      switchDisplayLevel({
        candidateIssueIds: ['root'],
        relations,
        childrenRelationTypeId: CHILDREN_TYPE_ID,
        targetLevel: -1,
      }),
    ).toEqual([]);
  });

  it('candidateIssueIds 為空陣列：回空陣列', () => {
    const result = switchDisplayLevel({
      candidateIssueIds: [],
      relations: [],
      childrenRelationTypeId: CHILDREN_TYPE_ID,
      targetLevel: 1,
    });

    expect(result).toEqual([]);
  });

  it('Children 鏈成環：computeIssueLevel 的 RelationError 原樣往外拋，不吞', () => {
    const relations: RelationCandidate[] = [
      { fromIssueId: 'a', toIssueId: 'b', relationTypeId: CHILDREN_TYPE_ID },
      { fromIssueId: 'b', toIssueId: 'a', relationTypeId: CHILDREN_TYPE_ID },
    ];

    expect(() =>
      switchDisplayLevel({
        candidateIssueIds: ['a'],
        relations,
        childrenRelationTypeId: CHILDREN_TYPE_ID,
        targetLevel: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'RELATION_CYCLE' }));
  });
});
