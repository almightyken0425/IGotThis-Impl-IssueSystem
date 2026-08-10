// API 層匯出口。畫面與資料 hook 只從此引用。

export { apiFetch, ApiError, UNAUTHORIZED_EVENT } from './client';
export * as authApi from './auth';
export type { LoginInput, RegisterInput } from './auth';
export * as workspaceApi from './workspace';
export type {
  Account,
  Company,
  CreateIssueInput,
  UpdateIssueInput,
  WorkspaceContext,
  WorkspaceIssue,
  WorkspaceResolutionOption,
  WorkspaceStatus,
} from './types';
