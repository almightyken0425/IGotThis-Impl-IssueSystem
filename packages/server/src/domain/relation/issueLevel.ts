// 工單層級計算。
//
// 對應 Spec：RelationIntegrityLogic 的 computeIssueLevel。
// 層級由母子結構計算，不由工單型別決定；純衍生計算，不落任何儲存欄位。

import type { RelationCandidate } from './types.js';
import { RelationError } from './types.js';

export interface IssueLevelInput {
  /** 目標工單。 */
  readonly issueId: string;
  /** 關聯記錄，含其他型別；計算自行以母子型別過濾。 */
  readonly relations: readonly RelationCandidate[];
  /** 母子關聯的型別識別碼；主題綁定等其他型別不參與計算。 */
  readonly childrenRelationTypeId: string;
}

/** 自目標工單沿母子關聯反查往上追至根，回傳層級；根為第一層。 */
export function computeIssueLevel(input: IssueLevelInput): number {
  const parentOf = new Map<string, string>();
  for (const relation of input.relations) {
    if (relation.relationTypeId === input.childrenRelationTypeId) {
      parentOf.set(relation.toIssueId, relation.fromIssueId);
    }
  }

  let level = 1;
  let current = input.issueId;
  // 母子關聯的禁環開關為真，正常資料不會成環；成環代表資料已壞，往上追不會收斂。
  const visited = new Set<string>([current]);

  for (;;) {
    const parent = parentOf.get(current);
    if (parent === undefined) {
      return level;
    }
    if (visited.has(parent)) {
      throw new RelationError('RELATION_CYCLE', `母子鏈已成環，無法計算層級：${input.issueId}`);
    }
    visited.add(parent);
    level += 1;
    current = parent;
  }
}
