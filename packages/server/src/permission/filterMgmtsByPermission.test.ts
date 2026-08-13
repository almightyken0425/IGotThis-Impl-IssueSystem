import { describe, expect, it } from 'vitest';

import type {
  CompanyTree,
  LevelDefinition,
  Role,
  RolePermissionBundle,
  RoleScope,
  ScopeKind,
} from '../db/repositories/index.js';

import { buildContainerIndex, type ContainerIndex } from './effectivePermission.js';
import { filterMgmtsByPermission } from './filterMgmtsByPermission.js';

// filterMgmtsByPermission 單元測試：純函式、不碰 DB。
// 容器樹沿用 effectivePermission.test.ts 的三層 team > product > mgmt 手工建法。

const COMPANY = 'company-1';
const TEAM_A = 'team-a';
const PRODUCT_A = 'product-a';
const MGMT_A1 = 'mgmt-a1';
const MGMT_A2 = 'mgmt-a2';
const TEAM_B = 'team-b';
const PRODUCT_B = 'product-b';
const MGMT_B1 = 'mgmt-b1';

function makeTree(): CompanyTree {
  return {
    id: COMPANY,
    name: 'Co',
    teams: [
      {
        id: TEAM_A,
        companyId: COMPANY,
        name: 'A',
        products: [
          {
            id: PRODUCT_A,
            companyId: COMPANY,
            teamId: TEAM_A,
            name: 'PA',
            mgmts: [mgmtNode(MGMT_A1, PRODUCT_A), mgmtNode(MGMT_A2, PRODUCT_A)],
          },
        ],
      },
      {
        id: TEAM_B,
        companyId: COMPANY,
        name: 'B',
        products: [
          {
            id: PRODUCT_B,
            companyId: COMPANY,
            teamId: TEAM_B,
            name: 'PB',
            mgmts: [mgmtNode(MGMT_B1, PRODUCT_B)],
          },
        ],
      },
    ],
  };
}

function mgmtNode(id: string, productId: string) {
  return {
    id,
    companyId: COMPANY,
    productId,
    name: id,
    containerIssueSetId: `${id}-set`,
    issueSets: [],
  };
}

function makeLevel(overrides: Partial<LevelDefinition> = {}): LevelDefinition {
  return {
    id: `level-${Math.random()}`,
    companyId: COMPANY,
    name: 'L',
    system: false,
    canRead: false,
    canComment: false,
    canCreate: false,
    canEditOwn: false,
    canEditAny: false,
    canArchive: false,
    canStructure: false,
    canAssignRole: false,
    createdOn: 0,
    updatedOn: 0,
    ...overrides,
  };
}

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: `role-${Math.random()}`,
    companyId: COMPANY,
    roleTitle: 'R',
    levelId: 'level-x',
    typeAdmin: false,
    orgAdmin: false,
    permAdmin: false,
    tags: null,
    createdOn: 0,
    updatedOn: 0,
    ...overrides,
  };
}

function scope(roleId: string, scopeKind: ScopeKind, scopeId: string): RoleScope {
  return {
    id: `scope-${Math.random()}`,
    companyId: COMPANY,
    roleId,
    scopeKind,
    scopeId,
    createdOn: 0,
    updatedOn: 0,
  };
}

function bundle(level: LevelDefinition, role: Role, scopes: RoleScope[]): RolePermissionBundle {
  return { role, level, scopes };
}

const index: ContainerIndex = buildContainerIndex(makeTree());

describe('filterMgmtsByPermission', () => {
  it('company 層角色涵蓋全部 mgmt：全數 readable', () => {
    const level = makeLevel({ canRead: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'company', COMPANY)])];

    const result = filterMgmtsByPermission([MGMT_A1, MGMT_A2, MGMT_B1], bundles, index);
    expect(result.readableMgmtIds).toEqual([MGMT_A1, MGMT_A2, MGMT_B1]);
    expect(result.deniedMgmtIds).toEqual([]);
  });

  it('mgmt 層角色只涵蓋單一 mgmt：該 mgmt readable、其餘 denied', () => {
    const level = makeLevel({ canRead: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'mgmt', MGMT_A1)])];

    const result = filterMgmtsByPermission([MGMT_A1, MGMT_A2, MGMT_B1], bundles, index);
    expect(result.readableMgmtIds).toEqual([MGMT_A1]);
    expect(result.deniedMgmtIds).toEqual([MGMT_A2, MGMT_B1]);
  });

  it('product 層角色涵蓋同產品下全部 mgmt，不涵蓋他產品', () => {
    const level = makeLevel({ canRead: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'product', PRODUCT_A)])];

    const result = filterMgmtsByPermission([MGMT_A1, MGMT_A2, MGMT_B1], bundles, index);
    expect(result.readableMgmtIds).toEqual([MGMT_A1, MGMT_A2]);
    expect(result.deniedMgmtIds).toEqual([MGMT_B1]);
  });

  it('team 層角色涵蓋同團隊下全部 mgmt，不涵蓋他團隊', () => {
    const level = makeLevel({ canRead: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'team', TEAM_A)])];

    const result = filterMgmtsByPermission([MGMT_A1, MGMT_A2, MGMT_B1], bundles, index);
    expect(result.readableMgmtIds).toEqual([MGMT_A1, MGMT_A2]);
    expect(result.deniedMgmtIds).toEqual([MGMT_B1]);
  });

  it('空 bundles（帳號未掛任何 Role）：全數 denied，fail-closed', () => {
    const result = filterMgmtsByPermission([MGMT_A1, MGMT_A2, MGMT_B1], [], index);
    expect(result.readableMgmtIds).toEqual([]);
    expect(result.deniedMgmtIds).toEqual([MGMT_A1, MGMT_A2, MGMT_B1]);
  });

  it('canRead 為 false、其他開關為 true：仍 denied，判定的是 canRead 本身', () => {
    const level = makeLevel({
      canRead: false,
      canComment: true,
      canCreate: true,
      canEditOwn: true,
      canEditAny: true,
      canArchive: true,
      canStructure: true,
      canAssignRole: true,
    });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'mgmt', MGMT_A1)])];

    const result = filterMgmtsByPermission([MGMT_A1], bundles, index);
    expect(result.readableMgmtIds).toEqual([]);
    expect(result.deniedMgmtIds).toEqual([MGMT_A1]);
  });

  it('mgmtIds 空陣列：兩邊都回空陣列', () => {
    const level = makeLevel({ canRead: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'company', COMPANY)])];

    const result = filterMgmtsByPermission([], bundles, index);
    expect(result.readableMgmtIds).toEqual([]);
    expect(result.deniedMgmtIds).toEqual([]);
  });
});
