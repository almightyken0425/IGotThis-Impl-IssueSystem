import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadEnv } from '../env.js';
import { applyMigrations } from '../migrate.js';

import {
  getAccount,
  getEffectivePermissionInputs,
  getRateAsOf,
  insertAccount,
  insertAccountRole,
  insertLevelDefinition,
  insertRateHistory,
  insertRole,
  insertRoleScope,
  insertTagGroup,
  insertTagValue,
  listAccountRoles,
  listRateHistories,
  listRoleScopes,
  type LevelDefinition,
  type Role,
} from './permissionRepo.js';
import { newId, seedCompany, withRollback } from './testFixtures.js';

// permissionRepo 整合測試：連 igotthis_test，每個 case 交易 rollback 隔離。

loadEnv();
const testUrl = process.env['TEST_DATABASE_URL'];
const suite = testUrl ? describe : describe.skip;

/** 內建等級的八開關真值表投影；本測試只需其中幾階。 */
function makeLevel(companyId: string, name: string, grants: Partial<LevelDefinition>): LevelDefinition {
  return {
    id: newId(),
    companyId,
    name,
    system: true,
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
    ...grants,
  };
}

function makeRole(companyId: string, levelId: string, overrides: Partial<Role> = {}): Role {
  return {
    id: newId(),
    companyId,
    roleTitle: 'R',
    levelId,
    typeAdmin: false,
    orgAdmin: false,
    permAdmin: false,
    tags: null,
    createdOn: 0,
    updatedOn: 0,
    ...overrides,
  };
}

/** 建帳號並回 id。 */
async function seedAccount(client: PoolClient, companyId: string, name = 'A'): Promise<string> {
  const id = newId();
  await insertAccount(client, {
    id,
    companyId,
    name,
    defaultCalendarName: null,
    tags: null,
    createdOn: 0,
    updatedOn: 0,
  });
  return id;
}

suite('permissionRepo / 整合', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl });
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await applyMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('帳號寫入後可取回，tags jsonb 原樣還原', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const id = newId();
      await insertAccount(client, {
        id,
        companyId,
        name: '小明',
        defaultCalendarName: '台灣',
        tags: { dept: 'eng' },
        createdOn: 100,
        updatedOn: 200,
      });

      const account = await getAccount(client, companyId, id);
      expect(account).toEqual({
        id,
        companyId,
        name: '小明',
        defaultCalendarName: '台灣',
        tags: { dept: 'eng' },
        createdOn: 100,
        updatedOn: 200,
      });
    });
  });

  it('Role 分派：insertAccountRole 建立掛載、可列出、可撤除', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const level = makeLevel(companyId, '成員', { canRead: true, canCreate: true });
      await insertLevelDefinition(client, level);
      const role = makeRole(companyId, level.id, { roleTitle: '工程' });
      await insertRole(client, role);
      const accountId = await seedAccount(client, companyId);

      const linkId = newId();
      await insertAccountRole(client, {
        id: linkId,
        companyId,
        accountId,
        roleId: role.id,
        createdOn: 0,
        updatedOn: 0,
      });

      const links = await listAccountRoles(client, companyId, accountId);
      expect(links).toHaveLength(1);
      expect(links[0]?.roleId).toBe(role.id);
    });
  });

  it('一個帳號可掛多個 Role', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const level = makeLevel(companyId, '觀看', { canRead: true });
      await insertLevelDefinition(client, level);
      const roleX = makeRole(companyId, level.id, { roleTitle: 'X' });
      const roleY = makeRole(companyId, level.id, { roleTitle: 'Y' });
      await insertRole(client, roleX);
      await insertRole(client, roleY);
      const accountId = await seedAccount(client, companyId);

      for (const roleId of [roleX.id, roleY.id]) {
        await insertAccountRole(client, {
          id: newId(),
          companyId,
          accountId,
          roleId,
          createdOn: 0,
          updatedOn: 0,
        });
      }

      const links = await listAccountRoles(client, companyId, accountId);
      expect(links.map((l) => l.roleId).sort()).toEqual([roleX.id, roleY.id].sort());
    });
  });

  it('有效權限查詢：一帳號多 Role，各帶等級與範圍清單', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const viewer = makeLevel(companyId, '觀看', { canRead: true });
      const manager = makeLevel(companyId, '管理', {
        canRead: true,
        canEditAny: true,
        canStructure: true,
        canAssignRole: true,
      });
      await insertLevelDefinition(client, viewer);
      await insertLevelDefinition(client, manager);

      // 低階 Role：company 範圍、只讀
      const lowRole = makeRole(companyId, viewer.id, { roleTitle: '全公司觀看' });
      await insertRole(client, lowRole);
      await insertRoleScope(client, {
        id: newId(),
        companyId,
        roleId: lowRole.id,
        scopeKind: 'company',
        scopeId: companyId,
        createdOn: 0,
        updatedOn: 0,
      });

      // 高階 Role：兩個 mgmt 範圍、管理級、開型別維護開關
      const highRole = makeRole(companyId, manager.id, { roleTitle: '產品管理', typeAdmin: true });
      await insertRole(client, highRole);
      const mgmtA = newId();
      const mgmtB = newId();
      for (const scopeId of [mgmtA, mgmtB]) {
        await insertRoleScope(client, {
          id: newId(),
          companyId,
          roleId: highRole.id,
          scopeKind: 'mgmt',
          scopeId,
          createdOn: 0,
          updatedOn: 0,
        });
      }

      const accountId = await seedAccount(client, companyId);
      for (const roleId of [lowRole.id, highRole.id]) {
        await insertAccountRole(client, {
          id: newId(),
          companyId,
          accountId,
          roleId,
          createdOn: 0,
          updatedOn: 0,
        });
      }

      const bundles = await getEffectivePermissionInputs(client, companyId, accountId);
      expect(bundles).toHaveLength(2);

      const high = bundles.find((b) => b.role.id === highRole.id);
      expect(high?.level.name).toBe('管理');
      expect(high?.level.canAssignRole).toBe(true);
      expect(high?.role.typeAdmin).toBe(true);
      expect(high?.scopes.map((s) => s.scopeId).sort()).toEqual([mgmtA, mgmtB].sort());
      expect(high?.scopes.every((s) => s.scopeKind === 'mgmt')).toBe(true);

      const low = bundles.find((b) => b.role.id === lowRole.id);
      expect(low?.level.canRead).toBe(true);
      expect(low?.level.canEditAny).toBe(false);
      expect(low?.scopes).toHaveLength(1);
      expect(low?.scopes[0]?.scopeKind).toBe('company');
    });
  });

  it('有效權限查詢：無掛任何 Role 回空清單', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      const accountId = await seedAccount(client, companyId);
      expect(await getEffectivePermissionInputs(client, companyId, accountId)).toEqual([]);
    });
  });

  it('費率歷史：依生效日升冪列出，getRateAsOf 取時點生效值', async () => {
    await withRollback(pool, async (client) => {
      const companyId = await seedCompany(client);
      await insertTagGroup(client, {
        id: newId(),
        companyId,
        name: '職級',
        target: 'account',
        system: true,
        createdOn: 0,
        updatedOn: 0,
      });
      const tagValueId = newId();
      // tag_value 需先有 group；重用上面 group id
      const groups = await client.query<{ id: string }>('SELECT id FROM tag_groups WHERE company_id = $1', [
        companyId,
      ]);
      const groupId = groups.rows[0]?.id as string;
      await insertTagValue(client, {
        id: tagValueId,
        companyId,
        tagGroupId: groupId,
        value: 'Senior',
        createdOn: 0,
        updatedOn: 0,
      });

      await insertRateHistory(client, {
        id: newId(),
        companyId,
        tagValueId,
        effectiveOn: 1000,
        hourlyRate: 500,
        createdOn: 0,
        updatedOn: 0,
      });
      await insertRateHistory(client, {
        id: newId(),
        companyId,
        tagValueId,
        effectiveOn: 3000,
        hourlyRate: 800,
        createdOn: 0,
        updatedOn: 0,
      });

      const histories = await listRateHistories(client, companyId, tagValueId);
      expect(histories.map((h) => h.effectiveOn)).toEqual([1000, 3000]);
      expect(histories.map((h) => h.hourlyRate)).toEqual([500, 800]);

      expect((await getRateAsOf(client, companyId, tagValueId, 500))).toBeUndefined();
      expect((await getRateAsOf(client, companyId, tagValueId, 2000))?.hourlyRate).toBe(500);
      expect((await getRateAsOf(client, companyId, tagValueId, 9999))?.hourlyRate).toBe(800);
    });
  });

  it('租戶隔離：另一 Company 查不到本 Company 的帳號、Role 掛載、範圍', async () => {
    await withRollback(pool, async (client) => {
      const companyA = await seedCompany(client, 'A');
      const companyB = await seedCompany(client, 'B');
      const level = makeLevel(companyA, '成員', { canRead: true });
      await insertLevelDefinition(client, level);
      const role = makeRole(companyA, level.id);
      await insertRole(client, role);
      await insertRoleScope(client, {
        id: newId(),
        companyId: companyA,
        roleId: role.id,
        scopeKind: 'company',
        scopeId: companyA,
        createdOn: 0,
        updatedOn: 0,
      });
      const accountId = await seedAccount(client, companyA);
      await insertAccountRole(client, {
        id: newId(),
        companyId: companyA,
        accountId,
        roleId: role.id,
        createdOn: 0,
        updatedOn: 0,
      });

      // 以 companyB 為租戶鍵查同一批 id：全數落空
      expect(await getAccount(client, companyB, accountId)).toBeUndefined();
      expect(await listAccountRoles(client, companyB, accountId)).toEqual([]);
      expect(await listRoleScopes(client, companyB, role.id)).toEqual([]);
      expect(await getEffectivePermissionInputs(client, companyB, accountId)).toEqual([]);
    });
  });
});
