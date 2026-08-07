import { describe, expect, it } from 'vitest';

import {
  validateRelationTypeDefinition,
  validateRelationTypeDeletion,
} from './relationTypeDefinition.js';
import type { RelationTypeSwitches, StandardRelationTypeName } from './types.js';

// 五開關的中性基底：全部為假，任何單獨開啟都不違反組合規則。
const neutralSwitches: RelationTypeSwitches = {
  exclusive: false,
  acyclic: false,
  ordered: false,
  symmetric: false,
  rollup: false,
};

describe('validateRelationTypeDefinition 對稱組合', () => {
  it('對稱為真且獨佔為真時擋下', () => {
    const result = validateRelationTypeDefinition({
      ...neutralSwitches,
      symmetric: true,
      exclusive: true,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('symmetric_forbids_exclusive_and_ordered');
  });

  it('對稱為真且有序為真時擋下', () => {
    const result = validateRelationTypeDefinition({
      ...neutralSwitches,
      symmetric: true,
      ordered: true,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('symmetric_forbids_exclusive_and_ordered');
  });
});

describe('validateRelationTypeDefinition 彙總組合', () => {
  it('彙總為真且獨佔為假時擋下', () => {
    const result = validateRelationTypeDefinition({
      ...neutralSwitches,
      rollup: true,
      exclusive: false,
      acyclic: true,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('rollup_requires_exclusive_and_acyclic');
  });

  it('彙總為真且禁環為假時擋下', () => {
    const result = validateRelationTypeDefinition({
      ...neutralSwitches,
      rollup: true,
      exclusive: true,
      acyclic: false,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('rollup_requires_exclusive_and_acyclic');
  });
});

describe('validateRelationTypeDefinition 放行案例', () => {
  it('五開關全假時放行', () => {
    expect(validateRelationTypeDefinition(neutralSwitches).ok).toBe(true);
  });

  // 期望值取自 Spec 的標準關聯型別表，內建四關聯的組合必須全數合法。
  it.each<[StandardRelationTypeName, RelationTypeSwitches]>([
    ['Children', { exclusive: true, acyclic: true, ordered: true, symmetric: false, rollup: true }],
    [
      'Container',
      { exclusive: true, acyclic: true, ordered: false, symmetric: false, rollup: true },
    ],
    ['Before', { exclusive: false, acyclic: true, ordered: false, symmetric: false, rollup: false }],
    [
      'RelatedTo',
      { exclusive: false, acyclic: false, ordered: false, symmetric: true, rollup: false },
    ],
  ])('內建關聯型別 %s 的開關組合放行', (_name, switches) => {
    expect(validateRelationTypeDefinition(switches).ok).toBe(true);
  });
});

describe('validateRelationTypeDeletion 刪除守門', () => {
  it('系統旗標為真時拒絕刪除', () => {
    const result = validateRelationTypeDeletion({ system: true });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('system_relation_type_not_deletable');
  });

  it('系統旗標為假時放行刪除', () => {
    expect(validateRelationTypeDeletion({ system: false }).ok).toBe(true);
  });
});
