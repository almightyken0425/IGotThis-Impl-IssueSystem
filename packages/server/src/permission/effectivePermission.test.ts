import { describe, expect, it } from 'vitest';

import type {
  CompanyTree,
  LevelDefinition,
  Role,
  RolePermissionBundle,
  RoleScope,
  ScopeKind,
} from '../db/repositories/index.js';

import {
  buildContainerIndex,
  checkRoleAssignment,
  computeEffectivePermission,
  hasCompanySwitch,
  type ContainerIndex,
} from './effectivePermission.js';

// effectivePermission 單元測試：純函式、不碰 DB。
// 容器樹以三層 team > product > mgmt 手工建，覆蓋整層涵蓋與精確相符兩路徑。

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
            mgmts: [
              mgmtNode(MGMT_A1, PRODUCT_A),
              mgmtNode(MGMT_A2, PRODUCT_A),
            ],
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

function bundle(
  level: LevelDefinition,
  role: Role,
  scopes: RoleScope[],
): RolePermissionBundle {
  return { role, level, scopes };
}

const index: ContainerIndex = buildContainerIndex(makeTree());

describe('computeEffectivePermission', () => {
  it('company 範圍涵蓋其下任一 mgmt 位置', () => {
    const level = makeLevel({ canRead: true, canCreate: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'company', COMPANY)])];

    const eff = computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_B1 });
    expect(eff.canRead).toBe(true);
    expect(eff.canCreate).toBe(true);
    expect(eff.canEditAny).toBe(false);
  });

  it('team 範圍涵蓋其下 product 的 mgmt，但不涵蓋他 team', () => {
    const level = makeLevel({ canEditAny: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'team', TEAM_A)])];

    expect(computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_A1 }).canEditAny).toBe(true);
    expect(computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_B1 }).canEditAny).toBe(false);
  });

  it('product 範圍只涵蓋自身產品下的 mgmt', () => {
    const level = makeLevel({ canArchive: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'product', PRODUCT_A)])];

    expect(computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_A2 }).canArchive).toBe(true);
    expect(computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_B1 }).canArchive).toBe(false);
  });

  it('mgmt 範圍僅精確涵蓋該單一 mgmt', () => {
    const level = makeLevel({ canStructure: true });
    const role = makeRole({ levelId: level.id });
    const bundles = [bundle(level, role, [scope(role.id, 'mgmt', MGMT_A1)])];

    expect(computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_A1 }).canStructure).toBe(true);
    expect(computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_A2 }).canStructure).toBe(false);
  });

  it('多 Role 命中同位置時逐開關取聯集', () => {
    const readerLevel = makeLevel({ canRead: true });
    const editorLevel = makeLevel({ canEditAny: true });
    const reader = makeRole({ levelId: readerLevel.id });
    const editor = makeRole({ levelId: editorLevel.id });
    const bundles = [
      bundle(readerLevel, reader, [scope(reader.id, 'company', COMPANY)]),
      bundle(editorLevel, editor, [scope(editor.id, 'mgmt', MGMT_A1)]),
    ];

    const eff = computeEffectivePermission(bundles, index, { kind: 'mgmt', id: MGMT_A1 });
    expect(eff.canRead).toBe(true);
    expect(eff.canEditAny).toBe(true);
  });

  it('公司層開關不吃範圍、跨全部 Role 聯集；未帶位置時等級開關全否', () => {
    const level = makeLevel({ canRead: true });
    const role = makeRole({ levelId: level.id, typeAdmin: true, permAdmin: true });
    const bundles = [bundle(level, role, [scope(role.id, 'mgmt', MGMT_A1)])];

    const eff = computeEffectivePermission(bundles, index);
    expect(eff.typeAdmin).toBe(true);
    expect(eff.permAdmin).toBe(true);
    expect(eff.orgAdmin).toBe(false);
    expect(eff.canRead).toBe(false);
  });
});

describe('hasCompanySwitch', () => {
  it('任一 Role 帶該開關即為真', () => {
    const level = makeLevel();
    const bundles = [
      bundle(level, makeRole({ levelId: level.id }), []),
      bundle(level, makeRole({ levelId: level.id, permAdmin: true }), []),
    ];
    expect(hasCompanySwitch(bundles, 'permAdmin')).toBe(true);
    expect(hasCompanySwitch(bundles, 'orgAdmin')).toBe(false);
  });
});

describe('checkRoleAssignment', () => {
  const managerLevel = makeLevel({
    canRead: true,
    canEditAny: true,
    canArchive: true,
    canStructure: true,
    canAssignRole: true,
  });

  function operatorAt(scopeKind: ScopeKind, scopeId: string): RolePermissionBundle[] {
    const role = makeRole({ levelId: managerLevel.id });
    return [bundle(managerLevel, role, [scope(role.id, scopeKind, scopeId)])];
  }

  it('操作者無分派開關一律拒絕', () => {
    const plainLevel = makeLevel({ canRead: true });
    const role = makeRole({ levelId: plainLevel.id });
    const operator = [bundle(plainLevel, role, [scope(role.id, 'company', COMPANY)])];

    const result = checkRoleAssignment(
      operator,
      { level: makeLevel({ canRead: true }), scopes: [] },
      index,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ASSIGN_FORBIDDEN');
  });

  it('目標範圍落在操作者範圍內、等級不越權則放行', () => {
    const operator = operatorAt('team', TEAM_A);
    const targetRole = makeRole({ levelId: 'x' });
    const result = checkRoleAssignment(
      operator,
      {
        level: makeLevel({ canRead: true, canEditAny: true }),
        scopes: [scope(targetRole.id, 'mgmt', MGMT_A1)],
      },
      index,
    );
    expect(result.ok).toBe(true);
  });

  it('目標範圍超出操作者範圍則拒絕', () => {
    const operator = operatorAt('team', TEAM_A);
    const targetRole = makeRole({ levelId: 'x' });
    const result = checkRoleAssignment(
      operator,
      { level: makeLevel({ canRead: true }), scopes: [scope(targetRole.id, 'mgmt', MGMT_B1)] },
      index,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SCOPE_EXCEEDED');
  });

  it('目標等級開關超出操作者等級則拒絕', () => {
    // 操作者是 product 範圍的成員級（可分派但不可封存）
    const memberLevel = makeLevel({ canRead: true, canEditAny: true, canAssignRole: true });
    const opRole = makeRole({ levelId: memberLevel.id });
    const operator = [bundle(memberLevel, opRole, [scope(opRole.id, 'product', PRODUCT_A)])];

    const targetRole = makeRole({ levelId: 'x' });
    const result = checkRoleAssignment(
      operator,
      {
        level: makeLevel({ canRead: true, canArchive: true }), // 封存超出操作者
        scopes: [scope(targetRole.id, 'mgmt', MGMT_A1)],
      },
      index,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LEVEL_EXCEEDED');
  });

  it('目標 Role 無範圍項目時範圍檢查自動通過', () => {
    const operator = operatorAt('mgmt', MGMT_A1);
    const result = checkRoleAssignment(
      operator,
      { level: makeLevel({ canRead: true }), scopes: [] },
      index,
    );
    expect(result.ok).toBe(true);
  });
});
