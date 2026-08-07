import type { Executor } from './executor.js';

// 檢視 repository：Views、ViewSortEntries 與欄位顯示設定的讀寫。
// domain 層無檢視實體型別（僅有看板欄計算型別），故本層自帶檢視儲存型別。
// 邊界：row 的 snake_case 轉 camelCase；jsonb 欄由 pg 解析為物件、寫入前 stringify。
// 租戶鍵 company_id 為每一筆查詢的必要條件，跨 Company 不可見。

/** Views 一列的 domain 形狀。sourceMgmtIds 恆為展開後的 Mgmt 識別清單。 */
export interface View {
  id: string;
  companyId: string;
  name: string;
  ownerId: string;
  viewType: string;
  sourceMgmtIds: string[];
  filterConfig: unknown | null;
  displayLevel: number;
  columnConfig: unknown | null;
  calendarName: string | null;
}

/** ViewSortEntries 一列的 domain 形狀。sortValue 只在該檢視內有意義。 */
export interface ViewSortEntry {
  id: string;
  companyId: string;
  viewId: string;
  issueId: string;
  sortValue: number;
}

interface ViewRow {
  id: string;
  company_id: string;
  name: string;
  owner_id: string;
  view_type: string;
  source_mgmt_ids: string[];
  filter_config: unknown | null;
  display_level: number;
  column_config: unknown | null;
  calendar_name: string | null;
}

interface ViewSortEntryRow {
  id: string;
  company_id: string;
  view_id: string;
  issue_id: string;
  sort_value: number;
}

const VIEW_COLUMNS = `id, company_id, name, owner_id, view_type,
  source_mgmt_ids, filter_config, display_level, column_config, calendar_name`;

/** 寫入一張檢視。 */
export async function insertView(exec: Executor, view: View): Promise<void> {
  await exec.query(
    `INSERT INTO views (${VIEW_COLUMNS})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      view.id,
      view.companyId,
      view.name,
      view.ownerId,
      view.viewType,
      JSON.stringify(view.sourceMgmtIds),
      toJsonbParam(view.filterConfig),
      view.displayLevel,
      toJsonbParam(view.columnConfig),
      view.calendarName,
    ],
  );
}

/** 取一張檢視；查無回 undefined。 */
export async function getView(
  exec: Executor,
  companyId: string,
  id: string,
): Promise<View | undefined> {
  const result = await exec.query<ViewRow>(
    `SELECT ${VIEW_COLUMNS} FROM views WHERE company_id = $1 AND id = $2`,
    [companyId, id],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : rowToView(row);
}

/** 某帳號擁有的全部檢視，依名稱升冪。 */
export async function listViewsByOwner(
  exec: Executor,
  companyId: string,
  ownerId: string,
): Promise<View[]> {
  const result = await exec.query<ViewRow>(
    `SELECT ${VIEW_COLUMNS} FROM views
     WHERE company_id = $1 AND owner_id = $2 ORDER BY name`,
    [companyId, ownerId],
  );
  return result.rows.map(rowToView);
}

/** 一個 Company 的全部檢視，依名稱升冪。 */
export async function listViewsByCompany(exec: Executor, companyId: string): Promise<View[]> {
  const result = await exec.query<ViewRow>(
    `SELECT ${VIEW_COLUMNS} FROM views WHERE company_id = $1 ORDER BY name`,
    [companyId],
  );
  return result.rows.map(rowToView);
}

/** 更新檢視的欄位顯示設定（顯示哪幾欄、欄序、欄寬）。 */
export async function updateViewColumnConfig(
  exec: Executor,
  companyId: string,
  id: string,
  columnConfig: unknown | null,
): Promise<void> {
  await exec.query(
    `UPDATE views SET column_config = $3 WHERE company_id = $1 AND id = $2`,
    [companyId, id, toJsonbParam(columnConfig)],
  );
}

/**
 * 刪一張檢視，連同其排序項；限同 Company，回是否真的刪到。
 * 先清 view_sort_entries 再刪 views（前者對後者有外鍵）；
 * 兩步須原子完成，`exec` 應為交易中的連線。
 */
export async function deleteView(
  exec: Executor,
  companyId: string,
  id: string,
): Promise<boolean> {
  await exec.query(
    `DELETE FROM view_sort_entries WHERE company_id = $1 AND view_id = $2`,
    [companyId, id],
  );
  const result = await exec.query(
    `DELETE FROM views WHERE company_id = $1 AND id = $2 RETURNING id`,
    [companyId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

/** 更新檢視的篩選條件。 */
export async function updateViewFilterConfig(
  exec: Executor,
  companyId: string,
  id: string,
  filterConfig: unknown | null,
): Promise<void> {
  await exec.query(
    `UPDATE views SET filter_config = $3 WHERE company_id = $1 AND id = $2`,
    [companyId, id, toJsonbParam(filterConfig)],
  );
}

/**
 * 指派工單於檢視的排序位置。
 * 未排序（無列）者新增，已排序者更新 sort_value；同檢視內每工單至多一筆。
 */
export async function upsertSortEntry(exec: Executor, entry: ViewSortEntry): Promise<void> {
  await exec.query(
    `INSERT INTO view_sort_entries (id, company_id, view_id, issue_id, sort_value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (view_id, issue_id)
     DO UPDATE SET sort_value = EXCLUDED.sort_value`,
    [entry.id, entry.companyId, entry.viewId, entry.issueId, entry.sortValue],
  );
}

/** 移除一筆排序項（工單退回未排序區）。 */
export async function deleteSortEntry(
  exec: Executor,
  companyId: string,
  viewId: string,
  issueId: string,
): Promise<void> {
  await exec.query(
    `DELETE FROM view_sort_entries
     WHERE company_id = $1 AND view_id = $2 AND issue_id = $3`,
    [companyId, viewId, issueId],
  );
}

/** 一張檢視的已排序項，依 sort_value 升冪，即該檢視的排定先後。 */
export async function listSortEntries(
  exec: Executor,
  companyId: string,
  viewId: string,
): Promise<ViewSortEntry[]> {
  const result = await exec.query<ViewSortEntryRow>(
    `SELECT id, company_id, view_id, issue_id, sort_value
     FROM view_sort_entries
     WHERE company_id = $1 AND view_id = $2
     ORDER BY sort_value`,
    [companyId, viewId],
  );
  return result.rows.map(rowToSortEntry);
}

/** null 存 SQL NULL，其餘 stringify 存 jsonb；避免把 JS null 寫成 jsonb 的 'null'。 */
function toJsonbParam(value: unknown | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function rowToView(row: ViewRow): View {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    ownerId: row.owner_id,
    viewType: row.view_type,
    sourceMgmtIds: row.source_mgmt_ids,
    filterConfig: row.filter_config,
    displayLevel: row.display_level,
    columnConfig: row.column_config,
    calendarName: row.calendar_name,
  };
}

function rowToSortEntry(row: ViewSortEntryRow): ViewSortEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    viewId: row.view_id,
    issueId: row.issue_id,
    sortValue: row.sort_value,
  };
}
