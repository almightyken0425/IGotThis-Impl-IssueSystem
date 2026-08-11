import type { FilterCondition, FilterConfig, IssueFilterCandidate } from './types.js';

// 套用檢視的篩選條件。
//
// 對應 spec: ViewLogic / applyViewFilter，僅實作 filterConfig 本身的條件過濾。
// spec 另有「缺欄位排除」分支（工單缺該檢視形態依賴的欄位時排除）這輪不實作：
// Views.viewType 系統不解讀語意，且沒有「形態→依賴欄位」的權威對照表可依循，
// 詳見這輪的 plan。排除不動排序值——排序值存 ViewSortEntries，本函式不碰。

export interface FilterResult {
  readonly included: readonly IssueFilterCandidate[];
  readonly excludedIds: readonly string[];
}

/** conditions 全 AND；filterConfig 為 null 或空 conditions 視為不篩選。 */
export function applyViewFilter(
  issues: readonly IssueFilterCandidate[],
  filterConfig: FilterConfig | null,
): FilterResult {
  const conditions = filterConfig?.conditions ?? [];
  if (conditions.length === 0) {
    return { included: issues, excludedIds: [] };
  }

  const included: IssueFilterCandidate[] = [];
  const excludedIds: string[] = [];

  for (const issue of issues) {
    if (conditions.every((condition) => matches(issue, condition))) {
      included.push(issue);
    } else {
      excludedIds.push(issue.issueId);
    }
  }

  return { included, excludedIds };
}

function matches(issue: IssueFilterCandidate, condition: FilterCondition): boolean {
  return issue.fields[condition.fieldName] === condition.value;
}
