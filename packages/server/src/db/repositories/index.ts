// repository 匯出口。
//
// 角色：domain 純型別與資料庫之間的橋。查詢回來的 snake_case row 轉成
//       domain camelCase 型別，寫入前反向轉；SQL 只存在本層。
// 邊界：api 依賴 repository，repository 依賴 domain 與 db 基礎層；domain 不反向依賴。

export type { Executor } from './executor.js';

export type {
  Company,
  CompanyTree,
  FieldDef,
  FieldKind,
  FieldSetDef,
  IssueFieldRecord,
  IssueSet,
  IssueTypeDefinition,
  Mgmt,
  MgmtNode,
  Product,
  ProductNode,
  ResolutionOption,
  StoredFieldValue,
  Team,
  TeamNode,
  WorkflowState,
  WorkflowTransition,
} from './types.js';

export * as containerRepo from './containerRepo.js';
export * as issueRepo from './issueRepo.js';
export type {
  ResolutionOptionInput,
  WorkflowStateInput,
  WorkflowTransitionInput,
} from './issueRepo.js';

export * as calendarRepo from './calendarRepo.js';
export type { CalendarDefinitionInput } from './calendarRepo.js';

export * as permissionRepo from './permissionRepo.js';
export type {
  Account,
  AccountRole,
  LevelDefinition,
  RateHistory,
  Role,
  RolePermissionBundle,
  RoleScope,
  ScopeKind,
  ShareLevel,
  ShareTargetKind,
  TagGroup,
  TagValue,
  ViewShare,
} from './permissionRepo.js';

export * as viewRepo from './viewRepo.js';
export type { View, ViewSortEntry } from './viewRepo.js';

export * as relationRepo from './relationRepo.js';
export { RelationRepoError } from './relationRepo.js';
export type {
  CreateRelationInput,
  CreateRelationResult,
  RelationRepoErrorCode,
} from './relationRepo.js';

export * as fieldRepo from './fieldRepo.js';
export type {
  AppendChangeLogInput,
  AppendFieldRecordInput,
  ChangeLogEntry,
} from './fieldRepo.js';
