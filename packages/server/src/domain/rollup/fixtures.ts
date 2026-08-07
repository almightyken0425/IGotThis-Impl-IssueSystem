// 測試用的快照組裝器。
//
// 只服務同目錄的測試檔，不從 domain 匯出口對外公開。
// 存在理由：每個彙總行為都要一份合法的 Company 定義區 + 關聯 + 欄位值，
// 逐檔手寫會把斷言埋在雜訊裡。

import type {
  FieldDef,
  IssueFieldRecord,
  IssueFieldValue,
  RollupRelation,
  RollupRelationType,
  RollupFieldValue,
  RollupMode,
  RollupSnapshot,
} from './types.js';

export const COMPANY_ID = 'company-1';

/** 內建 Children 關聯，彙總開關為真。 */
export const CHILDREN_TYPE_ID = 'reltype-children';
/** 內建 Container 關聯，彙總開關為真；用於一張工單被兩個持有端指到的情境。 */
export const CONTAINER_TYPE_ID = 'reltype-container';
/** 內建 Before 關聯，彙總開關為假；用於驗證不沿此型別收集下級。 */
export const BEFORE_TYPE_ID = 'reltype-before';

/** 標準關聯型別的彙總開關組合，取自 spec 的 StandardRelationTypes。 */
export const STANDARD_RELATION_TYPES: RollupRelationType[] = [
  { id: CHILDREN_TYPE_ID, companyId: COMPANY_ID, name: 'Children', rollup: true },
  { id: CONTAINER_TYPE_ID, companyId: COMPANY_ID, name: 'Container', rollup: true },
  { id: BEFORE_TYPE_ID, companyId: COMPANY_ID, name: 'Before', rollup: false },
];

/** 四個可彙總欄位加一個不可彙總欄位，算法取自 spec 的 StandardFieldCatalog。 */
export const STANDARD_FIELD_DEFS: FieldDef[] = [
  { companyId: COMPANY_ID, name: 'StartTime', rollupable: true, rollupFn: 'earliest' },
  { companyId: COMPANY_ID, name: 'EndTime', rollupable: true, rollupFn: 'latest' },
  { companyId: COMPANY_ID, name: 'StoryPoint', rollupable: true, rollupFn: 'sum' },
  { companyId: COMPANY_ID, name: 'WorkLog', rollupable: true, rollupFn: 'sum' },
  { companyId: COMPANY_ID, name: 'Title', rollupable: false, rollupFn: null },
];

export function makeSnapshot(overrides: Partial<RollupSnapshot> = {}): RollupSnapshot {
  return {
    companyId: COMPANY_ID,
    relationTypes: STANDARD_RELATION_TYPES,
    relations: [],
    fieldDefs: STANDARD_FIELD_DEFS,
    fieldValues: [],
    fieldRecords: [],
    ...overrides,
  };
}

/** 持有端指向被指端的一列關聯；預設走 Children。 */
export function relation(
  fromIssueId: string,
  toIssueId: string,
  relationTypeId: string = CHILDREN_TYPE_ID,
  companyId: string = COMPANY_ID,
): RollupRelation {
  return { companyId, fromIssueId, toIssueId, relationTypeId };
}

/** 一列工單欄位單值；`rollupMode` 未指定代表尚未決定初值。 */
export function fieldValue(
  issueId: string,
  fieldName: string,
  value: RollupFieldValue,
  rollupMode: RollupMode | null = null,
  companyId: string = COMPANY_ID,
): IssueFieldValue {
  return { companyId, issueId, fieldName, value, rollupMode };
}

/** 一筆工時填報。 */
export function workLog(
  issueId: string,
  value: number,
  id: string = `worklog-${issueId}-${String(value)}`,
  companyId: string = COMPANY_ID,
): IssueFieldRecord {
  return { id, companyId, issueId, fieldName: 'WorkLog', value };
}
