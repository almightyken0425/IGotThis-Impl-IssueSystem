import { invalid, valid } from '../shared/index.js';
import type {
  SuggestIssueSetKeyInput,
  ValidateIssueSetKeyInput,
  ValidateIssueSetKeyResult,
} from './types.js';

/** KEY 長度下限，兩字元。 */
export const KEY_MIN_LENGTH = 2;
/** KEY 長度上限，八字元。 */
export const KEY_MAX_LENGTH = 8;

/** 建議值取自產品名稱與工單集名稱各前四字元，合計不超過 KEY 長度上限。 */
const SEGMENT_LENGTH = 4;

const ALLOWED_KEY_PATTERN = /^[A-Z0-9]+$/;
const LEADING_DIGIT_PATTERN = /^[0-9]/;
const DISALLOWED_CHAR_PATTERN = /[^A-Z0-9]/g;
const LEADING_DIGITS_PATTERN = /^[0-9]+/;

/**
 * 產生工單集 KEY 建議值。
 * 對應 spec: NumberingLogic / suggestIssueSetKey。
 */
export function suggestIssueSetKey(input: SuggestIssueSetKeyInput): string | null {
  const combined = takeSegment(input.productName) + takeSegment(input.issueSetName);
  const suggestion = combined.replace(LEADING_DIGITS_PATTERN, '');

  return suggestion.length >= KEY_MIN_LENGTH ? suggestion : null;
}

function takeSegment(name: string): string {
  return name.toUpperCase().replace(DISALLOWED_CHAR_PATTERN, '').slice(0, SEGMENT_LENGTH);
}

/**
 * 驗證工單集 KEY。
 * 對應 spec: NumberingLogic / validateIssueSetKey。
 */
export function validateIssueSetKey(input: ValidateIssueSetKeyInput): ValidateIssueSetKeyResult {
  const { key, companyId, existingIssueSets } = input;

  if (key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH) {
    return invalid(
      'LENGTH_OUT_OF_RANGE',
      `KEY 長度須為 ${KEY_MIN_LENGTH} 至 ${KEY_MAX_LENGTH} 字元`,
    );
  }

  if (!ALLOWED_KEY_PATTERN.test(key)) {
    return invalid('INVALID_CHARACTER', 'KEY 僅允許大寫英文與數字');
  }

  if (LEADING_DIGIT_PATTERN.test(key)) {
    return invalid('LEADING_DIGIT', 'KEY 不可以數字開頭，否則與流水號無法區隔');
  }

  const taken = existingIssueSets.some(
    (issueSet) => issueSet.companyId === companyId && issueSet.key === key,
  );
  if (taken) {
    return invalid('DUPLICATE_IN_COMPANY', '同一 Company 內已存在相同 KEY，請改用其他 KEY');
  }

  return valid;
}
