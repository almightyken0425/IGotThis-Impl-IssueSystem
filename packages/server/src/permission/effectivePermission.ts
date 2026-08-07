import type {
  CompanyTree,
  LevelDefinition,
  RolePermissionBundle,
  RoleScope,
  ScopeKind,
} from '../db/repositories/index.js';
import { invalid, valid, type ValidationResult } from '../domain/index.js';

// 有效權限計算與分派 Role 授權判定。
//
// 座落於權限路由與 repository 之間，是權限模型的核心邏輯落點，對應 spec 的 PermissionLogic。
// domain 純層不帶權限實體型別（見 permissionRepo 註解），故本層操作 repository 的儲存型別，
// 與 auth service 同屬「可見 repo 型別的服務層」；純函式、不做 IO，資料由呼叫端以參數帶入。
//
// 邊界：
// - 範圍展開為讀取時計算，整層項目（company / team / product）於判定當下涵蓋子層，不預先固化。
// - 授權只增不減：多 Role 取聯集、逐開關取 OR，不支援排除規則。
// - 公司層開關（型別維護 / 組織結構 / 權限管理）不吃範圍清單，跨全部 Role 取聯集。

/** 等級的八個布林開關；有效等級為各開關跨命中 Role 的聯集。 */
const LEVEL_SWITCHES = [
  'canRead',
  'canComment',
  'canCreate',
  'canEditOwn',
  'canEditAny',
  'canArchive',
  'canStructure',
  'canAssignRole',
] as const;

type LevelSwitch = (typeof LEVEL_SWITCHES)[number];

/** 查核位置；粒度下限為 `mgmt`，亦可傳整層位置比對範圍涵蓋。 */
export interface PermissionLocation {
  readonly kind: ScopeKind;
  readonly id: string;
}

/** 查核位置的有效等級開關，加上不吃範圍的公司層三開關。 */
export interface EffectivePermission {
  readonly canRead: boolean;
  readonly canComment: boolean;
  readonly canCreate: boolean;
  readonly canEditOwn: boolean;
  readonly canEditAny: boolean;
  readonly canArchive: boolean;
  readonly canStructure: boolean;
  readonly canAssignRole: boolean;
  readonly typeAdmin: boolean;
  readonly orgAdmin: boolean;
  readonly permAdmin: boolean;
}

/**
 * 容器歸屬索引：由容器全樹壓平成 productId->teamId、mgmtId->productId 兩張對照，
 * 供範圍涵蓋判定 O(1) 上溯祖先。讀取時建，不落庫。
 */
export interface ContainerIndex {
  readonly productTeam: ReadonlyMap<string, string>;
  readonly mgmtProduct: ReadonlyMap<string, string>;
}

/** 位置上溯出的祖先鍵；company 層恆由 company 範圍涵蓋，不入此結構。 */
interface ResolvedLocation {
  readonly team: string | undefined;
  readonly product: string | undefined;
  readonly mgmt: string | undefined;
}

/** 由容器全樹建歸屬索引。 */
export function buildContainerIndex(tree: CompanyTree): ContainerIndex {
  const productTeam = new Map<string, string>();
  const mgmtProduct = new Map<string, string>();
  for (const team of tree.teams) {
    for (const product of team.products) {
      productTeam.set(product.id, team.id);
      for (const mgmt of product.mgmts) {
        mgmtProduct.set(mgmt.id, product.id);
      }
    }
  }
  return { productTeam, mgmtProduct };
}

/** 把查核位置上溯為其產品與團隊祖先；查不到歸屬時該層為 undefined。 */
function resolveLocation(location: PermissionLocation, index: ContainerIndex): ResolvedLocation {
  switch (location.kind) {
    case 'mgmt': {
      const product = index.mgmtProduct.get(location.id);
      const team = product === undefined ? undefined : index.productTeam.get(product);
      return { mgmt: location.id, product, team };
    }
    case 'product':
      return { mgmt: undefined, product: location.id, team: index.productTeam.get(location.id) };
    case 'team':
      return { mgmt: undefined, product: undefined, team: location.id };
    case 'company':
      return { mgmt: undefined, product: undefined, team: undefined };
  }
}

/** 一筆範圍是否涵蓋查核位置：整層項目涵蓋其子層，明列單項需精確相符。 */
function scopeCovers(scope: RoleScope, resolved: ResolvedLocation): boolean {
  switch (scope.scopeKind) {
    case 'company':
      return true;
    case 'team':
      return resolved.team === scope.scopeId;
    case 'product':
      return resolved.product === scope.scopeId;
    case 'mgmt':
      return resolved.mgmt === scope.scopeId;
  }
}

/**
 * 計算一帳號在查核位置的有效權限。
 *
 * 等級開關：取命中該位置的全部 Role 的等級，逐開關聯集；未帶位置時等級開關全否。
 * 公司層開關：不吃範圍清單，跨全部 Role 聯集，恆計算。
 */
export function computeEffectivePermission(
  bundles: readonly RolePermissionBundle[],
  index: ContainerIndex,
  location?: PermissionLocation,
): EffectivePermission {
  const covering =
    location === undefined
      ? []
      : bundles.filter((bundle) => {
          const resolved = resolveLocation(location, index);
          return bundle.scopes.some((scope) => scopeCovers(scope, resolved));
        });

  const levelGrants: Record<LevelSwitch, boolean> = {
    canRead: false,
    canComment: false,
    canCreate: false,
    canEditOwn: false,
    canEditAny: false,
    canArchive: false,
    canStructure: false,
    canAssignRole: false,
  };
  for (const bundle of covering) {
    for (const key of LEVEL_SWITCHES) {
      if (bundle.level[key]) levelGrants[key] = true;
    }
  }

  return {
    ...levelGrants,
    typeAdmin: bundles.some((b) => b.role.typeAdmin),
    orgAdmin: bundles.some((b) => b.role.orgAdmin),
    permAdmin: bundles.some((b) => b.role.permAdmin),
  };
}

/** 一帳號是否持有某公司層開關（型別維護 / 組織結構 / 權限管理）。 */
export function hasCompanySwitch(
  bundles: readonly RolePermissionBundle[],
  which: 'typeAdmin' | 'orgAdmin' | 'permAdmin',
): boolean {
  return bundles.some((bundle) => bundle.role[which]);
}

/** 待分派 / 待撤除 Role 的等級與範圍，供授權判定比對。 */
export interface RoleAssignmentTarget {
  readonly level: LevelDefinition;
  readonly scopes: readonly RoleScope[];
}

/** 分派 Role 的三種拒絕碼：無分派開關、範圍越界、等級越權。 */
export type RoleAssignmentDenial = 'ASSIGN_FORBIDDEN' | 'SCOPE_EXCEEDED' | 'LEVEL_EXCEEDED';

/**
 * 判定操作者可否把目標 Role 分派給帳號，對應 spec 的 assignRole。
 *
 * 前置：操作者須持有分派 Role 開關（任一 Role 的等級 canAssignRole 為真），否則拒絕。
 * 兩條限制皆以操作者「具分派能力的 Role」為權威來源：
 * - 範圍：目標 Role 的每一範圍項目都須落在操作者具分派能力範圍的涵蓋內。
 * - 等級：目標 Role 等級的每個開關都須不超出操作者具分派能力等級的聯集。
 */
export function checkRoleAssignment(
  operatorBundles: readonly RolePermissionBundle[],
  target: RoleAssignmentTarget,
  index: ContainerIndex,
): ValidationResult<RoleAssignmentDenial> {
  const assignCapable = operatorBundles.filter((bundle) => bundle.level.canAssignRole);
  if (assignCapable.length === 0) {
    return invalid('ASSIGN_FORBIDDEN', '無分派 Role 權限');
  }

  const authorityScopes = assignCapable.flatMap((bundle) => bundle.scopes);
  for (const targetScope of target.scopes) {
    const asLocation: PermissionLocation = { kind: targetScope.scopeKind, id: targetScope.scopeId };
    const resolved = resolveLocation(asLocation, index);
    const withinAuthority = authorityScopes.some((scope) => scopeCovers(scope, resolved));
    if (!withinAuthority) {
      return invalid('SCOPE_EXCEEDED', '只能在自身範圍內分派');
    }
  }

  for (const key of LEVEL_SWITCHES) {
    const targetGrants = target.level[key];
    const ceiling = assignCapable.some((bundle) => bundle.level[key]);
    if (targetGrants && !ceiling) {
      return invalid('LEVEL_EXCEEDED', '只能給不高於自身的等級');
    }
  }

  return valid;
}
