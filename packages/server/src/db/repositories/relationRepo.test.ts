import type { PoolClient, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RelationTypeDefinition } from '../../domain/index.js';
import {
  createRelation,
  deleteRelation,
  findRelationById,
  findRelationTypeById,
  findRelationTypeByName,
  findRelationsFromIssue,
  findRelationsToIssue,
  insertRelationType,
  listRelationTypes,
  RelationRepoError,
} from './relationRepo.js';
import { hasTestDb, makeTestPool, randomUUID, seedTenant, withRollback } from './testSupport.js';
import type { Fixture } from './testSupport.js';

// relationRepo 整合測試：連 igotthis_test，每個 case 交易 rollback 隔離。
// 涵蓋關聯型別讀寫、工單關聯建立與正反查、獨佔與禁環與母子邊界的 domain 前置檢查、租戶隔離。

const suite = hasTestDb ? describe : describe.skip;

/** 在給定工單集下種一張工單，回傳其 id。 */
async function seedIssue(client: PoolClient, fx: Fixture, issueSetId: string = fx.issueSetId): Promise<string> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO issues (id, company_id, issue_set_id, issue_type_id, issue_key) VALUES ($1,$2,$3,$4,$5)',
    [id, fx.companyId, issueSetId, fx.issueTypeId, `K-${id.slice(0, 8)}`],
  );
  return id;
}

/** 在同 Company 下另種一個工單集，回傳其 id。 */
async function seedIssueSet(client: PoolClient, fx: Fixture): Promise<string> {
  const id = randomUUID();
  await client.query('INSERT INTO issue_sets (id, company_id, mgmt_id, name, key) VALUES ($1,$2,$3,$4,$5)', [
    id,
    fx.companyId,
    fx.mgmtId,
    'Set2',
    `K2-${id.slice(0, 4)}`,
  ]);
  return id;
}

/** 組一筆關聯型別定義；開關預設全關，由 overrides 覆寫。 */
function makeRelType(
  companyId: string,
  overrides: Partial<RelationTypeDefinition> & { readonly name: string },
): RelationTypeDefinition {
  return {
    id: randomUUID(),
    companyId,
    exclusive: false,
    acyclic: false,
    ordered: false,
    symmetric: false,
    rollup: false,
    system: false,
    createdOn: 0,
    updatedOn: 0,
    ...overrides,
  };
}

suite('relationRepo / 整合', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await makeTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  // ----- 關聯型別定義 -----

  it('寫入關聯型別後可依 id 與名稱取回', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const def = makeRelType(fx.companyId, { name: 'RelatedTo', symmetric: true });
      const written = await insertRelationType(def, client);
      expect(written.name).toBe('RelatedTo');
      expect(written.symmetric).toBe(true);

      const byId = await findRelationTypeById(fx.companyId, def.id, client);
      expect(byId?.id).toBe(def.id);
      const byName = await findRelationTypeByName(fx.companyId, 'RelatedTo', client);
      expect(byName?.id).toBe(def.id);
    });
  });

  it('列出某 Company 的關聯型別依名稱排序', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      await insertRelationType(makeRelType(fx.companyId, { name: 'Before', acyclic: true }), client);
      await insertRelationType(makeRelType(fx.companyId, { name: 'After', acyclic: true }), client);
      const list = await listRelationTypes(fx.companyId, client);
      expect(list.map((t) => t.name)).toEqual(['After', 'Before']);
    });
  });

  it('非法開關組合的關聯型別擲 RelationRepoError、不落地', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      // 對稱與獨佔並存為非法組合。
      const bad = makeRelType(fx.companyId, { name: 'Bad', symmetric: true, exclusive: true });
      await expect(insertRelationType(bad, client)).rejects.toBeInstanceOf(RelationRepoError);
      const list = await listRelationTypes(fx.companyId, client);
      expect(list).toHaveLength(0);
    });
  });

  // ----- 工單關聯建立 -----

  it('建立關聯落地，exclusive 由型別定義複製', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const relType = await insertRelationType(
        makeRelType(fx.companyId, { name: 'Container', exclusive: true, acyclic: true, rollup: true }),
        client,
      );
      const holder = await seedIssue(client, fx);
      const target = await seedIssue(client, fx);
      const res = await createRelation(
        {
          id: randomUUID(),
          companyId: fx.companyId,
          fromIssueId: holder,
          toIssueId: target,
          relationTypeId: relType.id,
          createdOn: 1,
          updatedOn: 1,
        },
        client,
      );
      if (!res.ok) throw new Error(`預期成功，實際 ${res.code}`);
      expect(res.relation.exclusive).toBe(true);
      expect(res.relation.ordinal).toBe(0);

      const byId = await findRelationById(fx.companyId, res.relation.id, client);
      expect(byId?.toIssueId).toBe(target);
    });
  });

  it('引用不存在的關聯型別擲 RelationRepoError', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const holder = await seedIssue(client, fx);
      const target = await seedIssue(client, fx);
      await expect(
        createRelation(
          {
            id: randomUUID(),
            companyId: fx.companyId,
            fromIssueId: holder,
            toIssueId: target,
            relationTypeId: randomUUID(),
            createdOn: 0,
            updatedOn: 0,
          },
          client,
        ),
      ).rejects.toBeInstanceOf(RelationRepoError);
    });
  });

  // ----- 反查 -----

  it('反查：以被指端取回指向它的所有關聯（多持有端）', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const relType = await insertRelationType(makeRelType(fx.companyId, { name: 'Ref' }), client);
      const target = await seedIssue(client, fx);
      const h1 = await seedIssue(client, fx);
      const h2 = await seedIssue(client, fx);
      for (const holder of [h1, h2]) {
        const res = await createRelation(
          {
            id: randomUUID(),
            companyId: fx.companyId,
            fromIssueId: holder,
            toIssueId: target,
            relationTypeId: relType.id,
            createdOn: 0,
            updatedOn: 0,
          },
          client,
        );
        if (!res.ok) throw new Error(res.code);
      }

      const reverse = await findRelationsToIssue(fx.companyId, target, relType.id, client);
      expect(reverse).toHaveLength(2);
      expect(new Set(reverse.map((r) => r.fromIssueId))).toEqual(new Set([h1, h2]));

      // 正查：持有端只持有它自己那一條。
      const forward = await findRelationsFromIssue(fx.companyId, h1, relType.id, client);
      expect(forward).toHaveLength(1);
      expect(forward[0]?.toIssueId).toBe(target);
    });
  });

  // ----- 獨佔約束 -----

  it('獨佔約束觸發：被指端已被指入時第二次建立回 exclusive_target_already_held', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const relType = await insertRelationType(
        makeRelType(fx.companyId, { name: 'Excl', exclusive: true }),
        client,
      );
      const target = await seedIssue(client, fx);
      const h1 = await seedIssue(client, fx);
      const h2 = await seedIssue(client, fx);

      const first = await createRelation(
        { id: randomUUID(), companyId: fx.companyId, fromIssueId: h1, toIssueId: target, relationTypeId: relType.id, createdOn: 0, updatedOn: 0 },
        client,
      );
      expect(first.ok).toBe(true);

      const second = await createRelation(
        { id: randomUUID(), companyId: fx.companyId, fromIssueId: h2, toIssueId: target, relationTypeId: relType.id, createdOn: 0, updatedOn: 0 },
        client,
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.code).toBe('exclusive_target_already_held');
    });
  });

  it('schema 部分唯一索引為獨佔硬底線：繞過 domain 檢查直插第二列被擋', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const relType = await insertRelationType(
        makeRelType(fx.companyId, { name: 'Excl2', exclusive: true }),
        client,
      );
      const target = await seedIssue(client, fx);
      const h1 = await seedIssue(client, fx);
      const h2 = await seedIssue(client, fx);
      const insertRaw = (from: string): Promise<unknown> =>
        client.query(
          `INSERT INTO issue_relations (id, company_id, from_issue_id, to_issue_id, relation_type_id, exclusive, created_on, updated_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [randomUUID(), fx.companyId, from, target, relType.id, true, 0, 0],
        );
      await insertRaw(h1);
      await expect(insertRaw(h2)).rejects.toThrow();
    });
  });

  // ----- 禁環約束 -----

  it('禁環約束觸發：回寫會成環時回 acyclic_would_form_cycle', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const relType = await insertRelationType(
        makeRelType(fx.companyId, { name: 'Acy', acyclic: true }),
        client,
      );
      const a = await seedIssue(client, fx);
      const b = await seedIssue(client, fx);
      const ab = await createRelation(
        { id: randomUUID(), companyId: fx.companyId, fromIssueId: a, toIssueId: b, relationTypeId: relType.id, createdOn: 0, updatedOn: 0 },
        client,
      );
      expect(ab.ok).toBe(true);

      const ba = await createRelation(
        { id: randomUUID(), companyId: fx.companyId, fromIssueId: b, toIssueId: a, relationTypeId: relType.id, createdOn: 0, updatedOn: 0 },
        client,
      );
      expect(ba.ok).toBe(false);
      if (!ba.ok) expect(ba.code).toBe('acyclic_would_form_cycle');
    });
  });

  // ----- 母子邊界 -----

  it('母子邊界：Children 跨工單集回 children_crosses_issue_set', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const children = await insertRelationType(
        makeRelType(fx.companyId, {
          name: 'Children',
          exclusive: true,
          acyclic: true,
          ordered: true,
          rollup: true,
        }),
        client,
      );
      const otherSet = await seedIssueSet(client, fx);
      const parent = await seedIssue(client, fx);
      const childElsewhere = await seedIssue(client, fx, otherSet);
      const res = await createRelation(
        { id: randomUUID(), companyId: fx.companyId, fromIssueId: parent, toIssueId: childElsewhere, relationTypeId: children.id, createdOn: 0, updatedOn: 0 },
        client,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('children_crosses_issue_set');
    });
  });

  // ----- 刪除 -----

  it('刪除關聯：命中回 true、再刪回 false', async () => {
    await withRollback(pool, async (client) => {
      const fx = await seedTenant(client);
      const relType = await insertRelationType(makeRelType(fx.companyId, { name: 'Del' }), client);
      const from = await seedIssue(client, fx);
      const to = await seedIssue(client, fx);
      const res = await createRelation(
        { id: randomUUID(), companyId: fx.companyId, fromIssueId: from, toIssueId: to, relationTypeId: relType.id, createdOn: 0, updatedOn: 0 },
        client,
      );
      if (!res.ok) throw new Error(res.code);
      expect(await deleteRelation(fx.companyId, res.relation.id, client)).toBe(true);
      expect(await deleteRelation(fx.companyId, res.relation.id, client)).toBe(false);
      expect(await findRelationById(fx.companyId, res.relation.id, client)).toBeUndefined();
    });
  });

  // ----- 租戶隔離 -----

  it('租戶隔離：A 的關聯型別與關聯對 B 不可見', async () => {
    await withRollback(pool, async (client) => {
      const a = await seedTenant(client);
      const b = await seedTenant(client);
      const relType = await insertRelationType(makeRelType(a.companyId, { name: 'Ref' }), client);
      const from = await seedIssue(client, a);
      const to = await seedIssue(client, a);
      const res = await createRelation(
        { id: randomUUID(), companyId: a.companyId, fromIssueId: from, toIssueId: to, relationTypeId: relType.id, createdOn: 0, updatedOn: 0 },
        client,
      );
      if (!res.ok) throw new Error(res.code);

      // B 租戶視角查不到 A 的型別與關聯。
      expect(await findRelationTypeById(b.companyId, relType.id, client)).toBeUndefined();
      expect(await listRelationTypes(b.companyId, client)).toHaveLength(0);
      expect(await findRelationById(b.companyId, res.relation.id, client)).toBeUndefined();
      expect(await findRelationsToIssue(b.companyId, to, relType.id, client)).toHaveLength(0);
    });
  });
});
