import type { SortEntryRef } from './types.js';

// 新主題單入表：已排序區與未排序區的分類。
//
// 對應 spec: ViewLogic / admitNewContainerIssue。
// 本函式不寫入任何資料，是純分類查詢——「入未排序區」等於「不在 sortEntries
// 裡」這個既有狀態，新建的主題單只要沒人寫過排序值，天然就落在未排序區，
// 不需要任何動作。未排序數量由呼叫端對 unsortedIds 取 length，不在此另帶欄位。

export interface ContainerIssuePartition {
  readonly sortedIds: readonly string[];
  readonly unsortedIds: readonly string[];
}

/**
 * 依 sortEntries 把候選主題單分成已排序（依 sortValue 升冪）與未排序兩區。
 * sortEntries 若含候選清單外的 issueId（如已被篩選排除、但排序值仍保留），不計入。
 */
export function admitNewContainerIssue(
  issueIds: readonly string[],
  sortEntries: readonly SortEntryRef[],
): ContainerIssuePartition {
  const sortValueById = new Map(sortEntries.map((entry) => [entry.issueId, entry.sortValue]));

  const sorted: { readonly id: string; readonly sortValue: number }[] = [];
  const unsortedIds: string[] = [];

  for (const id of issueIds) {
    const sortValue = sortValueById.get(id);
    if (sortValue === undefined) {
      unsortedIds.push(id);
    } else {
      sorted.push({ id, sortValue });
    }
  }

  sorted.sort((a, b) => a.sortValue - b.sortValue);

  return { sortedIds: sorted.map((entry) => entry.id), unsortedIds };
}
