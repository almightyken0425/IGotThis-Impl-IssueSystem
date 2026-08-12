// API 層匯出口。畫面與資料 hook 只從此引用。

export { apiFetch, ApiError, UNAUTHORIZED_EVENT } from './client';
export * as authApi from './auth';
export type { LoginInput, RegisterInput } from './auth';
export * as workspaceApi from './workspace';
export * as containersApi from './containers';
export * as viewsApi from './views';
export type {
  Account,
  Company,
  CreateIssueInput,
  CreateViewInput,
  Mgmt,
  Product,
  Team,
  UpdateIssueInput,
  View,
  WorkspaceContext,
  WorkspaceIssue,
  WorkspaceResolutionOption,
  WorkspaceStatus,
} from './types';
