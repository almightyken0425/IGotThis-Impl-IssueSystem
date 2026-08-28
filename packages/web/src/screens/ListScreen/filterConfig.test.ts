import { describe, expect, it } from 'vitest';

import {
  addFilterConditionRow,
  buildFilterConfig,
  filterFieldOptions,
  parseFilterConditionRows,
  removeFilterConditionRow,
  updateFilterConditionRow,
} from './filterConfig';
import type { FieldDef } from '../../api';

function fieldDef(overrides: Partial<FieldDef>): FieldDef {
  return {
    companyId: 'company-1',
    name: 'title',
    fieldSetName: '基本',
    kind: 'single',
    valueType: 'text',
    system: true,
    readonly: false,
    rollupable: false,
    rollupFn: null,
    tracked: false,
    label: '標題',
    ...overrides,
  };
}

describe('parseFilterConditionRows', () => {
  it('null 回空陣列', () => {
    expect(parseFilterConditionRows(null)).toEqual([]);
  });

  it('非物件（字串／數字）回空陣列', () => {
    expect(parseFilterConditionRows('bad')).toEqual([]);
    expect(parseFilterConditionRows(42)).toEqual([]);
  });

  it('物件但缺 conditions 陣列回空陣列', () => {
    expect(parseFilterConditionRows({})).toEqual([]);
    expect(parseFilterConditionRows({ conditions: 'not-array' })).toEqual([]);
  });

  it('正常解析出欄位與值，id 依陣列位置生成', () => {
    const rows = parseFilterConditionRows({
      conditions: [
        { fieldName: 'status', operator: 'equals', value: '處理中' },
        { fieldName: 'assignee', operator: 'equals', value: '陳彥廷' },
      ],
    });
    expect(rows).toEqual([
      { id: 'row-0', fieldName: 'status', value: '處理中' },
      { id: 'row-1', fieldName: 'assignee', value: '陳彥廷' },
    ]);
  });

  it('單一條件不是物件時跳過，不中斷其餘列', () => {
    const rows = parseFilterConditionRows({
      conditions: [null, { fieldName: 'status', operator: 'equals', value: '已完成' }],
    });
    expect(rows).toEqual([{ id: 'row-1', fieldName: 'status', value: '已完成' }]);
  });

  it('fieldName 非字串時跳過該列', () => {
    const rows = parseFilterConditionRows({ conditions: [{ fieldName: 42, value: 'x' }] });
    expect(rows).toEqual([]);
  });

  it('value 缺席時視為空字串，不是拋錯', () => {
    const rows = parseFilterConditionRows({ conditions: [{ fieldName: 'status' }] });
    expect(rows).toEqual([{ id: 'row-0', fieldName: 'status', value: '' }]);
  });
});

describe('buildFilterConfig', () => {
  it('空陣列回 null', () => {
    expect(buildFilterConfig([])).toBeNull();
  });

  it('欄位未選的列濾掉', () => {
    const result = buildFilterConfig([{ id: 'a', fieldName: '', value: 'x' }]);
    expect(result).toBeNull();
  });

  it('值空白的列濾掉', () => {
    const result = buildFilterConfig([{ id: 'a', fieldName: 'status', value: '' }]);
    expect(result).toBeNull();
  });

  it('全部列都濾掉時回 null，不是空 conditions 陣列', () => {
    const result = buildFilterConfig([
      { id: 'a', fieldName: '', value: 'x' },
      { id: 'b', fieldName: 'status', value: '' },
    ]);
    expect(result).toBeNull();
  });

  it('完成的列組回 equals 條件，全 AND', () => {
    const result = buildFilterConfig([
      { id: 'a', fieldName: 'status', value: '處理中' },
      { id: 'b', fieldName: 'assignee', value: '陳彥廷' },
    ]);
    expect(result).toEqual({
      conditions: [
        { fieldName: 'status', operator: 'equals', value: '處理中' },
        { fieldName: 'assignee', operator: 'equals', value: '陳彥廷' },
      ],
    });
  });

  it('未完成列與完成列並存時，只送完成的那些', () => {
    const result = buildFilterConfig([
      { id: 'a', fieldName: 'status', value: '處理中' },
      { id: 'b', fieldName: '', value: '' },
    ]);
    expect(result).toEqual({ conditions: [{ fieldName: 'status', operator: 'equals', value: '處理中' }] });
  });
});

describe('addFilterConditionRow', () => {
  it('附加一列空白條件在尾端', () => {
    const rows = addFilterConditionRow([{ id: 'a', fieldName: 'status', value: 'x' }], 'b');
    expect(rows).toEqual([
      { id: 'a', fieldName: 'status', value: 'x' },
      { id: 'b', fieldName: '', value: '' },
    ]);
  });
});

describe('removeFilterConditionRow', () => {
  it('移除指定 id 的列', () => {
    const rows = removeFilterConditionRow(
      [
        { id: 'a', fieldName: 'status', value: 'x' },
        { id: 'b', fieldName: 'assignee', value: 'y' },
      ],
      'a',
    );
    expect(rows).toEqual([{ id: 'b', fieldName: 'assignee', value: 'y' }]);
  });

  it('id 不存在時不動作，回傳原參照', () => {
    const original = [{ id: 'a', fieldName: 'status', value: 'x' }];
    expect(removeFilterConditionRow(original, 'missing')).toBe(original);
  });
});

describe('updateFilterConditionRow', () => {
  it('改指定列的欄位', () => {
    const rows = updateFilterConditionRow(
      [{ id: 'a', fieldName: 'status', value: 'x' }],
      'a',
      { fieldName: 'assignee' },
    );
    expect(rows).toEqual([{ id: 'a', fieldName: 'assignee', value: 'x' }]);
  });

  it('改指定列的值', () => {
    const rows = updateFilterConditionRow(
      [{ id: 'a', fieldName: 'status', value: 'x' }],
      'a',
      { value: 'y' },
    );
    expect(rows).toEqual([{ id: 'a', fieldName: 'status', value: 'y' }]);
  });

  it('id 不存在時不動作，回傳原參照', () => {
    const original = [{ id: 'a', fieldName: 'status', value: 'x' }];
    expect(updateFilterConditionRow(original, 'missing', { value: 'y' })).toBe(original);
  });
});

describe('filterFieldOptions', () => {
  it('只收單值欄位，濾掉多值與關聯欄位', () => {
    const options = filterFieldOptions([
      fieldDef({ name: 'title', label: '標題', kind: 'single' }),
      fieldDef({ name: 'ChangeLog', label: '變更歷史', kind: 'multi' }),
      fieldDef({ name: 'parent', label: '母項', kind: 'relation' }),
    ]);
    expect(options).toEqual([{ value: 'title', label: '標題' }]);
  });

  it('依 label 排序', () => {
    // 用 ASCII 前綴而非純中文字比大小：中文排序依 locale 定案不同、不同環境
    // 跑出的順序可能不一致，前綴讓「有排序」這件事本身可驗證、不綁死特定順序。
    const options = filterFieldOptions([
      fieldDef({ name: 'status', label: 'B 狀態' }),
      fieldDef({ name: 'assignee', label: 'A 負責人' }),
    ]);
    expect(options.map((o) => o.label)).toEqual(['A 負責人', 'B 狀態']);
  });
});
