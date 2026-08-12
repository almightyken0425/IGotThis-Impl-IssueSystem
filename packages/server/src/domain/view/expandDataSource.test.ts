import { describe, expect, it } from 'vitest';

import { expandDataSource } from './expandDataSource.js';

describe('expandDataSource', () => {
  it('空候選清單：回空陣列', () => {
    expect(expandDataSource({ mgmtIds: [] })).toEqual([]);
  });

  it('候選皆不重複：原樣回傳，保留順序', () => {
    expect(expandDataSource({ mgmtIds: ['a', 'b', 'c'] })).toEqual(['a', 'b', 'c']);
  });

  it('候選含重複 id：去重，只留一筆，保留首次出現順序', () => {
    expect(expandDataSource({ mgmtIds: ['a', 'b', 'a', 'c', 'b'] })).toEqual(['a', 'b', 'c']);
  });

  it('單一 Mgmt 範圍：候選只有一筆，回該筆', () => {
    expect(expandDataSource({ mgmtIds: ['solo'] })).toEqual(['solo']);
  });

  it('不改動輸入陣列', () => {
    const input = ['a', 'b', 'a'];
    expandDataSource({ mgmtIds: input });
    expect(input).toEqual(['a', 'b', 'a']);
  });
});
