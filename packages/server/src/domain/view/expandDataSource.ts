// 展開資料來源：候選 Mgmt id 去重。
//
// 對應 spec: ViewLogic / expandDataSource。
// 樹狀走訪（Team→Products→Mgmts）由呼叫端（route 層）依組織範圍查好候選清單再傳入，
// 本函式不碰資料庫——比照 domain/view 其餘函式的「純本地計算」邊界。
// 「展開後不再跟隨來源」規則的落地：candidates 是呼叫當下拍好的一份清單，
// 往後容器樹再變動，與這份已拍好的清單無關。

export interface OrgScopeCandidates {
  readonly mgmtIds: readonly string[];
}

/** 去重候選 Mgmt id，保留首次出現順序，得到檢視要存的 sourceMgmtIds。 */
export function expandDataSource(candidates: OrgScopeCandidates): readonly string[] {
  return Array.from(new Set(candidates.mgmtIds));
}
