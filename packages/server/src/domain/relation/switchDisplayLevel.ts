import { computeIssueLevel } from './issueLevel.js';
import type { RelationCandidate } from './types.js';

// 切換顯示層級：從候選工單集合篩出層級等於目標值的工單。
//
// 對應 spec：ViewLogic 的 switchDisplayLevel。與 computeIssueLevel 同置
// relation domain——這裡直接重用它的計算規則（spec 明講「依 computeIssueLevel
// 的計算規則」），放同 domain 內部呼叫，不跨 domain 呼叫行為。
//
// 候選工單集合與其 Container／Children 關聯記錄，由呼叫端先展開好帶入
// （目標主題單沿 Container 關聯查得的工單，加上這些工單沿 Children 關聯
// 可達的全部工單）；本函式只做純本地的分層篩選，不碰資料庫。

export interface SwitchDisplayLevelInput {
  readonly candidateIssueIds: readonly string[];
  readonly relations: readonly RelationCandidate[];
  readonly childrenRelationTypeId: string;
  readonly targetLevel: number;
}

/** 層級等於 targetLevel 的候選工單清單；無符合項時回空陣列，即該主題單在此層級無內容。 */
export function switchDisplayLevel(input: SwitchDisplayLevelInput): readonly string[] {
  return input.candidateIssueIds.filter(
    (issueId) =>
      computeIssueLevel({
        issueId,
        relations: input.relations,
        childrenRelationTypeId: input.childrenRelationTypeId,
      }) === input.targetLevel,
  );
}
