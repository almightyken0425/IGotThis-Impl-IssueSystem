import { describe, expect, it } from 'vitest';

import { suggestIssueSetKey, validateIssueSetKey } from './issueSetKey.js';
import type { IssueSetKeyEntry } from './types.js';

describe('validateIssueSetKey', () => {
  it('大寫英數、長度合規、同 Company 內未撞號的 KEY 通過驗證', () => {
    const result = validateIssueSetKey({
      key: 'LSPEC',
      companyId: 'company-1',
      existingIssueSets: [],
    });

    expect(result).toEqual({ ok: true });
  });

  it('長度未達二字元或超過八字元皆退回，二與八本身通過', () => {
    expect(validate('A')).toMatchObject({ ok: false, code: 'LENGTH_OUT_OF_RANGE' });
    expect(validate('ABCDEFGHI')).toMatchObject({ ok: false, code: 'LENGTH_OUT_OF_RANGE' });
    expect(validate('AB')).toEqual({ ok: true });
    expect(validate('ABCDEFGH')).toEqual({ ok: true });
  });

  it('空字串退回長度錯誤', () => {
    expect(validate('')).toMatchObject({ ok: false, code: 'LENGTH_OUT_OF_RANGE' });
  });

  it('大寫英文與數字以外的字元一律退回', () => {
    for (const key of ['lspec', 'LSpec', 'L-SPEC', 'L_SPEC', 'L SPEC', 'ＬＳＰＥＣ', '規格單']) {
      expect(validate(key)).toMatchObject({ ok: false, code: 'INVALID_CHARACTER' });
    }
  });

  it('大寫英文與數字混用通過', () => {
    expect(validate('SP2')).toEqual({ ok: true });
  });

  it('數字開頭退回，數字在後不受影響', () => {
    expect(validate('1AB')).toMatchObject({ ok: false, code: 'LEADING_DIGIT' });
    expect(validate('0X')).toMatchObject({ ok: false, code: 'LEADING_DIGIT' });
    expect(validate('99999999')).toMatchObject({ ok: false, code: 'LEADING_DIGIT' });
    expect(validate('A1')).toEqual({ ok: true });
  });

  it('同 Company 內撞號退回，跨 Company 同名放行', () => {
    const existing: IssueSetKeyEntry[] = [
      { companyId: 'company-1', key: 'LSPEC' },
      { companyId: 'company-2', key: 'DESIGN' },
    ];

    expect(validate('LSPEC', existing)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_IN_COMPANY',
    });
    expect(validate('DESIGN', existing)).toEqual({ ok: true });
  });
});

describe('suggestIssueSetKey', () => {
  it('取產品名稱與工單集名稱各前四字元組出建議值', () => {
    expect(suggestIssueSetKey({ productName: 'Ledger', issueSetName: 'Spec' })).toBe('LEDGSPEC');
  });

  it('大寫英數以外的字元先剔除再取字元', () => {
    expect(suggestIssueSetKey({ productName: 'Su Su GiGi', issueSetName: 'v2 規劃' })).toBe(
      'SUSUV2',
    );
    expect(suggestIssueSetKey({ productName: '會計 App', issueSetName: '第一期' })).toBe('APP');
  });

  it('建議值不以數字開頭，開頭數字整段剔除', () => {
    expect(suggestIssueSetKey({ productName: '3M Tape', issueSetName: 'Core' })).toBe('MTACORE');
    expect(suggestIssueSetKey({ productName: '2026', issueSetName: 'Plan' })).toBe('PLAN');
  });

  it('湊不足長度下限時回傳 null，由使用者自填', () => {
    expect(suggestIssueSetKey({ productName: '會計', issueSetName: '第一期' })).toBeNull();
    expect(suggestIssueSetKey({ productName: '', issueSetName: '' })).toBeNull();
    expect(suggestIssueSetKey({ productName: '', issueSetName: 'X' })).toBeNull();
    expect(suggestIssueSetKey({ productName: 'X', issueSetName: 'Y' })).toBe('XY');
  });

  it('建議值必為合法 KEY', () => {
    const suggestion = suggestIssueSetKey({ productName: 'IGotThis', issueSetName: 'Issue Set' });

    expect(suggestion).not.toBeNull();
    expect(validate(suggestion as string)).toEqual({ ok: true });
  });
});

function validate(key: string, existingIssueSets: readonly IssueSetKeyEntry[] = []) {
  return validateIssueSetKey({ key, companyId: 'company-1', existingIssueSets });
}
