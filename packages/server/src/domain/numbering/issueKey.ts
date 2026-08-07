import type {
  AssignIssueKeyResult,
  IssueSetNumberingState,
  IssueSetSequenceState,
  TakeNextSeqResult,
} from './types.js';
import { NumberingError } from './types.js';

/** 前綴與流水號的分隔字元。 */
const KEY_SEPARATOR = '-';

/**
 * 組出工單編號字串，例如 `LSPEC-142`。
 * 對應 spec: NumberingLogic / assignIssueKey 的編號組成。
 */
export function formatIssueKey(prefix: string, seq: number): string {
  return `${prefix}${KEY_SEPARATOR}${String(seq)}`;
}

/**
 * 於工單集取號。
 * 對應 spec: NumberingLogic / assignIssueKey 的取流水號段。
 */
export function takeNextSeq(issueSet: IssueSetSequenceState): TakeNextSeqResult {
  const { nextSeq } = issueSet;

  if (!Number.isSafeInteger(nextSeq) || nextSeq < 1) {
    throw new NumberingError(
      'SEQUENCE_OUT_OF_RANGE',
      `nextSeq 須為正整數，取得 ${String(nextSeq)}`,
    );
  }

  return { seq: nextSeq, nextSeq: nextSeq + 1 };
}

/**
 * 產生工單編號。
 * 對應 spec: NumberingLogic / assignIssueKey。
 * 編號產生後永不變更，工單移至其他工單集仍保留原號。
 */
export function assignIssueKey(issueSet: IssueSetNumberingState): AssignIssueKeyResult {
  const { seq, nextSeq } = takeNextSeq(issueSet);

  return { issueKey: formatIssueKey(issueSet.key, seq), nextSeq };
}
