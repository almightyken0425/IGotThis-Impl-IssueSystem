import { describe, expect, it } from 'vitest';

import { assignIssueKey, formatIssueKey, takeNextSeq } from './issueKey.js';

describe('takeNextSeq', () => {
  it('取得當前流水號，並回傳前進一格的 nextSeq', () => {
    expect(takeNextSeq({ nextSeq: 1 })).toEqual({ seq: 1, nextSeq: 2 });
    expect(takeNextSeq({ nextSeq: 142 })).toEqual({ seq: 142, nextSeq: 143 });
  });

  it('連續取號逐格前進，刪除工單不使號碼回收', () => {
    const first = takeNextSeq({ nextSeq: 1 });
    const second = takeNextSeq(first);
    const third = takeNextSeq(second);

    expect([first.seq, second.seq, third.seq]).toEqual([1, 2, 3]);
    // 前兩張刪掉後再取號，序列仍從 4 起跳：取號只看 nextSeq，不看現存工單。
    expect(takeNextSeq(third).seq).toBe(4);
  });

  it('拒絕非正整數的 nextSeq', () => {
    for (const nextSeq of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => takeNextSeq({ nextSeq })).toThrowError(
        expect.objectContaining({ code: 'SEQUENCE_OUT_OF_RANGE' }),
      );
    }
  });
});

describe('formatIssueKey', () => {
  it('編號為前綴加連字號加流水號', () => {
    expect(formatIssueKey('LSPEC', 142)).toBe('LSPEC-142');
    expect(formatIssueKey('AB', 1)).toBe('AB-1');
  });

  it('流水號不補零，位數隨值增長', () => {
    expect(formatIssueKey('LSPEC', 9)).toBe('LSPEC-9');
    expect(formatIssueKey('LSPEC', 1000000)).toBe('LSPEC-1000000');
  });
});

describe('assignIssueKey', () => {
  it('以工單集 KEY 為前綴、於該工單集取號，並回傳前進後的 nextSeq', () => {
    expect(assignIssueKey({ key: 'LSPEC', nextSeq: 142 })).toEqual({
      issueKey: 'LSPEC-142',
      nextSeq: 143,
    });
  });

  it('各工單集序列獨立，不跨工單集共用', () => {
    const spec = assignIssueKey({ key: 'LSPEC', nextSeq: 142 });
    const design = assignIssueKey({ key: 'DSGN', nextSeq: 1 });

    expect(spec.issueKey).toBe('LSPEC-142');
    expect(design.issueKey).toBe('DSGN-1');
  });

  it('工單集 nextSeq 不合法時中止', () => {
    expect(() => assignIssueKey({ key: 'LSPEC', nextSeq: 0 })).toThrowError(
      expect.objectContaining({ code: 'SEQUENCE_OUT_OF_RANGE' }),
    );
  });
});
