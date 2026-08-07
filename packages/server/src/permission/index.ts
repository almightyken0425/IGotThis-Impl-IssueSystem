// 權限服務層匯出口。
//
// 角色：有效權限計算與分派 Role 授權判定的落點，操作 repository 儲存型別、純函式。
// 邊界：權限路由依賴本層取判斷結果，本層依賴 repository 型別與 domain 的 ValidationResult。

export {
  buildContainerIndex,
  checkRoleAssignment,
  computeEffectivePermission,
  hasCompanySwitch,
} from './effectivePermission.js';
export type {
  ContainerIndex,
  EffectivePermission,
  PermissionLocation,
  RoleAssignmentDenial,
  RoleAssignmentTarget,
} from './effectivePermission.js';
