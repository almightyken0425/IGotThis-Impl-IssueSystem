import { computeEffectivePermission } from './effectivePermission.js';
import type { ContainerIndex } from './effectivePermission.js';
import type { RolePermissionBundle } from '../db/repositories/index.js';

// 依 Mgmt 的讀取權把清單分桶，對應 spec PermissionLogic 的 filterViewByPermission 執行段：
// 「逐 Mgmt 呼叫 computeEffectivePermission 判定讀取權」。
//
// 不叫 filterViewByPermission：spec 該函式的完整語意含「查工單、標示被濾筆數」等 IO，
// 這裡只做純判定那一半，比照 checkRoleAssignment 對 spec assignRole 的切法命名，
// 誠實反映本函式不做 IO。IO 組裝（依分桶結果查工單、算筆數）留給呼叫端。

export interface MgmtPermissionPartition {
  readonly readableMgmtIds: readonly string[];
  readonly deniedMgmtIds: readonly string[];
}

/** 純函式、不做 IO；bundles／index 由呼叫端先查好帶入，比照 computeEffectivePermission 的既定慣例。 */
export function filterMgmtsByPermission(
  mgmtIds: readonly string[],
  bundles: readonly RolePermissionBundle[],
  index: ContainerIndex,
): MgmtPermissionPartition {
  const readableMgmtIds: string[] = [];
  const deniedMgmtIds: string[] = [];

  for (const mgmtId of mgmtIds) {
    const effective = computeEffectivePermission(bundles, index, { kind: 'mgmt', id: mgmtId });
    if (effective.canRead) readableMgmtIds.push(mgmtId);
    else deniedMgmtIds.push(mgmtId);
  }

  return { readableMgmtIds, deniedMgmtIds };
}
