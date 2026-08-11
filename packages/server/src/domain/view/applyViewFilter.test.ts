import { describe, expect, it } from 'vitest';

import { applyViewFilter } from './applyViewFilter.js';
import type { FilterConfig, IssueFilterCandidate } from './types.js';

// 缺欄位排除（工單缺該檢視形態依賴的欄位）這輪不實作：viewType 系統不解讀語意，
// 且找不到「形態→依賴欄位」的權威對照表，見 plan 說明。本檔只驗 filterConfig
// 本身的條件過濾。

const ISSUES: readonly IssueFilterCandidate[] = [
  { issueId: 'a', fields: { status: '待處理', assignee: '甲' } },
  { issueId: 'b', fields: { status: '處理中', assignee: '甲' } },
  { issueId: 'c', fields: { status: '待處理', assignee: '乙' } },
];

describe('applyViewFilter', () => {
  it('filterConfig 為 null：不篩選，全部保留', () => {
    const result = applyViewFilter(ISSUES, null);

    expect(result.included).toEqual(ISSUES);
    expect(result.excludedIds).toEqual([]);
  });

  it('conditions 為空陣列：不篩選，全部保留', () => {
    const result = applyViewFilter(ISSUES, { conditions: [] });

    expect(result.included).toEqual(ISSUES);
    expect(result.excludedIds).toEqual([]);
  });

  it('單一條件：只留下符合的工單，其餘進 excludedIds', () => {
    const config: FilterConfig = { conditions: [{ fieldName: 'status', operator: 'equals', value: '待處理' }] };
    const result = applyViewFilter(ISSUES, config);

    expect(result.included.map((i) => i.issueId)).toEqual(['a', 'c']);
    expect(result.excludedIds).toEqual(['b']);
  });

  it('多條件 AND：須全部符合才保留', () => {
    const config: FilterConfig = {
      conditions: [
        { fieldName: 'status', operator: 'equals', value: '待處理' },
        { fieldName: 'assignee', operator: 'equals', value: '甲' },
      ],
    };
    const result = applyViewFilter(ISSUES, config);

    expect(result.included.map((i) => i.issueId)).toEqual(['a']);
    expect(result.excludedIds).toEqual(['b', 'c']);
  });

  it('條件指到的欄位不存在：視為不符合，排除', () => {
    const config: FilterConfig = { conditions: [{ fieldName: 'point', operator: 'equals', value: 3 }] };
    const result = applyViewFilter(ISSUES, config);

    expect(result.included).toEqual([]);
    expect(result.excludedIds).toEqual(['a', 'b', 'c']);
  });

  it('不改動輸入陣列', () => {
    const snapshot = ISSUES.map((i) => i.issueId);
    applyViewFilter(ISSUES, { conditions: [{ fieldName: 'status', operator: 'equals', value: '待處理' }] });

    expect(ISSUES.map((i) => i.issueId)).toEqual(snapshot);
  });
});
