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

/** 工作區脈絡：登入後啟動點回傳，含工單集、型別與流程狀態。 */
export interface WorkspaceContext {
  readonly company: Company;
  readonly issueSet: { readonly id: string; readonly name: string; readonly key: string };
  readonly issueType: { readonly id: string; readonly name: string; readonly label: string };
  readonly statuses: readonly WorkspaceStatus[];
}

/** 流程狀態：name 即看板欄與清單狀態的識別，isTerminal 決定是否為結案欄。 */
export interface WorkspaceStatus {
  readonly name: string;
  readonly isTerminal: boolean;
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
}

/** 建立工單的輸入。 */
export interface CreateIssueInput {
  readonly title: string;
  readonly status?: string;
  readonly assignee?: string;
  readonly point?: number;
  readonly due?: string;
}

/** 更新工單欄位的輸入；帶到的欄位就寫、null 清除、未帶不動。 */
export interface UpdateIssueInput {
  readonly title?: string;
  readonly status?: string;
  readonly assignee?: string | '';
  readonly point?: number | null;
  readonly due?: string | null;
}
