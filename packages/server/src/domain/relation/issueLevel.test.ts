import { describe, expect, it } from 'vitest';

import { computeIssueLevel } from './issueLevel.js';

const CHILDREN_TYPE_ID = 'rt-children';

describe('computeIssueLevel 根工單', () => {
  it('工單集內無父工單的工單為第一層', () => {
    const level = computeIssueLevel({
      issueId: 'issue-root',
      relations: [],
      childrenRelationTypeId: CHILDREN_TYPE_ID,
    });

    expect(level).toBe(1);
  });
});

describe('computeIssueLevel 母子鏈', () => {
  it('單一父工單的子工單為第二層', () => {
    const level = computeIssueLevel({
      issueId: 'issue-child',
      relations: [
        {
          fromIssueId: 'issue-root',
          toIssueId: 'issue-child',
          relationTypeId: CHILDREN_TYPE_ID,
        },
      ],
      childrenRelationTypeId: CHILDREN_TYPE_ID,
    });

    expect(level).toBe(2);
  });
});

describe('computeIssueLevel 多層鏈', () => {
  it('自根每往下一段母子關聯，層級加一', () => {
    const relations = [
      { fromIssueId: 'issue-1', toIssueId: 'issue-2', relationTypeId: CHILDREN_TYPE_ID },
      { fromIssueId: 'issue-2', toIssueId: 'issue-3', relationTypeId: CHILDREN_TYPE_ID },
      { fromIssueId: 'issue-3', toIssueId: 'issue-4', relationTypeId: CHILDREN_TYPE_ID },
    ];

    const levelOf = (issueId: string): number =>
      computeIssueLevel({ issueId, relations, childrenRelationTypeId: CHILDREN_TYPE_ID });

    expect(levelOf('issue-4')).toBe(4);
    expect(levelOf('issue-3')).toBe(3);
    expect(levelOf('issue-1')).toBe(1);
  });

  it('五百層深鏈仍算得出層級', () => {
    const depth = 500;
    const relations = Array.from({ length: depth - 1 }, (_unused, index) => ({
      fromIssueId: `issue-${String(index + 1)}`,
      toIssueId: `issue-${String(index + 2)}`,
      relationTypeId: CHILDREN_TYPE_ID,
    }));

    const level = computeIssueLevel({
      issueId: `issue-${String(depth)}`,
      relations,
      childrenRelationTypeId: CHILDREN_TYPE_ID,
    });

    expect(level).toBe(depth);
  });
});

describe('computeIssueLevel 主題單不佔層', () => {
  const CONTAINER_TYPE_ID = 'rt-container';

  it('被主題單綁定的根工單仍為第一層', () => {
    const level = computeIssueLevel({
      issueId: 'issue-root',
      relations: [
        {
          fromIssueId: 'issue-topic',
          toIssueId: 'issue-root',
          relationTypeId: CONTAINER_TYPE_ID,
        },
      ],
      childrenRelationTypeId: CHILDREN_TYPE_ID,
    });

    expect(level).toBe(1);
  });

  it('主題綁定不加進母子鏈的層數', () => {
    const level = computeIssueLevel({
      issueId: 'issue-child',
      relations: [
        {
          fromIssueId: 'issue-topic',
          toIssueId: 'issue-root',
          relationTypeId: CONTAINER_TYPE_ID,
        },
        { fromIssueId: 'issue-root', toIssueId: 'issue-child', relationTypeId: CHILDREN_TYPE_ID },
      ],
      childrenRelationTypeId: CHILDREN_TYPE_ID,
    });

    expect(level).toBe(2);
  });

  it('目標工單不在任何關聯記錄中時為第一層', () => {
    const level = computeIssueLevel({
      issueId: 'issue-lonely',
      relations: [
        { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: CHILDREN_TYPE_ID },
      ],
      childrenRelationTypeId: CHILDREN_TYPE_ID,
    });

    expect(level).toBe(1);
  });
});

describe('computeIssueLevel 錯誤路徑', () => {
  it('母子鏈已成環時丟錯，不無限往上追', () => {
    const relations = [
      { fromIssueId: 'issue-a', toIssueId: 'issue-b', relationTypeId: CHILDREN_TYPE_ID },
      { fromIssueId: 'issue-b', toIssueId: 'issue-a', relationTypeId: CHILDREN_TYPE_ID },
    ];

    expect(() =>
      computeIssueLevel({
        issueId: 'issue-a',
        relations,
        childrenRelationTypeId: CHILDREN_TYPE_ID,
      }),
    ).toThrowError(expect.objectContaining({ code: 'RELATION_CYCLE' }));
  });

  it('工單自己指向自己時丟錯', () => {
    expect(() =>
      computeIssueLevel({
        issueId: 'issue-a',
        relations: [
          { fromIssueId: 'issue-a', toIssueId: 'issue-a', relationTypeId: CHILDREN_TYPE_ID },
        ],
        childrenRelationTypeId: CHILDREN_TYPE_ID,
      }),
    ).toThrowError(expect.objectContaining({ code: 'RELATION_CYCLE' }));
  });
});
