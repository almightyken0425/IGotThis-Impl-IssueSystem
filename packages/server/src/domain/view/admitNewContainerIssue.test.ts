import { describe, expect, it } from 'vitest';

import { admitNewContainerIssue } from './admitNewContainerIssue.js';
import type { SortEntryRef } from './types.js';

describe('admitNewContainerIssue', () => {
  it('全部皆有排序值：sortedIds 依 sortValue 升冪，未排序區為空', () => {
    const result = admitNewContainerIssue(
      ['a', 'b'],
      entries([
        ['b', 200],
        ['a', 100],
      ]),
    );

    expect(result.sortedIds).toEqual(['a', 'b']);
    expect(result.unsortedIds).toEqual([]);
  });

  it('新建工單無排序值：先進未排序區', () => {
    const result = admitNewContainerIssue(['a', 'new-issue'], entries([['a', 100]]));

    expect(result.sortedIds).toEqual(['a']);
    expect(result.unsortedIds).toEqual(['new-issue']);
  });

  it('全部皆無排序值：全數落未排序區，依候選清單原順序', () => {
    const result = admitNewContainerIssue(['b', 'a'], []);

    expect(result.sortedIds).toEqual([]);
    expect(result.unsortedIds).toEqual(['b', 'a']);
  });

  it('排序值指向不在候選清單內的工單：該筆不計入（如已被篩選排除，值仍留但不入表）', () => {
    const result = admitNewContainerIssue(
      ['a'],
      entries([
        ['a', 100],
        ['excluded', 50],
      ]),
    );

    expect(result.sortedIds).toEqual(['a']);
    expect(result.unsortedIds).toEqual([]);
  });
});

function entries(pairs: readonly (readonly [string, number])[]): SortEntryRef[] {
  return pairs.map(([issueId, sortValue]) => ({ issueId, sortValue }));
}
