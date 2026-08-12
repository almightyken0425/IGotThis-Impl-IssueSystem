// API 對外型別 · 與後端回應形狀逐名對齊
//
// 單一真相：前端所有畫面與資料層只引用本檔的型別，不各自重造。
// 形狀對應後端路由的 send 內容（packages/server/src/api/routes/*）。

/** 對外帳號投影，永不含密碼雜湊。對齊 auth service 的 PublicAccount。 */
export interface Account {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly email: string;
}

/** 公司。對齊 containerRepo 的 Company。 */
export interface Company {
  readonly id: string;
  readonly name: string;
}

/** 工作區脈絡：登入後啟動點回傳，含工單集、型別、流程狀態與結案原因選項。 */
export interface WorkspaceContext {
  readonly company: Company;
  readonly issueSet: { readonly id: string; readonly name: string; readonly key: string };
  readonly issueType: { readonly id: string; readonly name: string; readonly label: string };
  readonly statuses: readonly WorkspaceStatus[];
  readonly resolutionOptions: readonly WorkspaceResolutionOption[];
}

/** 流程狀態：name 即看板欄與清單狀態的識別，isTerminal 決定是否為結案欄。 */
export interface WorkspaceStatus {
  readonly name: string;
  readonly isTerminal: boolean;
}

/** 結案原因選項：getResolutionOptions 的產出投影。 */
export interface WorkspaceResolutionOption {
  readonly value: string;
}

/** 工單 + 欄位單值摺疊而成的加值列。三個畫面共用的工單資料形狀。 */
export interface WorkspaceIssue {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly status: string;
  readonly assignee: string;
  readonly point: number | null;
  readonly due: string | null;
  readonly resolution: string | null;
}

/** 建立工單的輸入。 */
export interface CreateIssueInput {
  readonly title: string;
  readonly status?: string;
  readonly assignee?: string;
  readonly point?: number;
  readonly due?: string;
}

/** 更新工單欄位的輸入；帶到的欄位就寫、null 清除、未帶不動。resolution 只能隨一次真正的 status 轉換一併提供。 */
export interface UpdateIssueInput {
  readonly title?: string;
  readonly status?: string;
  readonly resolution?: string;
  readonly assignee?: string | '';
  readonly point?: number | null;
  readonly due?: string | null;
}

/** 團隊。對齊 containerRepo 的 Team。 */
export interface Team {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
}

/** 產品。對齊 containerRepo 的 Product。 */
export interface Product {
  readonly id: string;
  readonly companyId: string;
  readonly teamId: string;
  readonly name: string;
}

/** 管理域。對齊 containerRepo 的 Mgmt。 */
export interface Mgmt {
  readonly id: string;
  readonly companyId: string;
  readonly productId: string;
  readonly name: string;
  readonly containerIssueSetId: string;
}

/** 檢視。對齊 viewRepo 的 View。 */
export interface View {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly ownerId: string;
  readonly viewType: string;
  readonly sourceMgmtIds: readonly string[];
  readonly filterConfig: unknown;
  readonly displayLevel: number;
  readonly columnConfig: unknown;
  readonly calendarName: string | null;
}

/** 建立檢視的輸入：資料來源以組織範圍表示，展開由後端 expandDataSource 執行。 */
export interface CreateViewInput {
  readonly name: string;
  readonly scopeType: 'team' | 'product' | 'mgmt';
  readonly scopeId: string;
}
