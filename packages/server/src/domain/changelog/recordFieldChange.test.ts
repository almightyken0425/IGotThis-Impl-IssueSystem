import { describe, expect, it } from 'vitest';

import { recordFieldChange } from './recordFieldChange.js';
import type { RecordFieldChangeInput, TrackedFieldDef } from './types.js';

const fieldDefs: readonly TrackedFieldDef[] = [
  { name: 'status', tracked: true },
  { name: 'title', tracked: false },
];

function baseInput(overrides: Partial<RecordFieldChangeInput> = {}): RecordFieldChangeInput {
  return {
    changes: [],
    actor: 'account-1',
    now: 1000,
    fieldDefs,
    ...overrides,
  };
}

describe('recordFieldChange', () => {
  it('追蹤開關為真且新舊值不同，產生一筆記錄', () => {
    const entries = recordFieldChange(
      baseInput({ changes: [{ fieldName: 'status', oldValue: '待處理', newValue: '處理中' }] }),
    );
    expect(entries).toEqual([
      { fieldName: 'status', oldValue: '待處理', newValue: '處理中', actor: 'account-1', time: 1000 },
    ]);
  });

  it('追蹤開關為假，即使新舊值不同也不產生記錄', () => {
    const entries = recordFieldChange(
      baseInput({ changes: [{ fieldName: 'title', oldValue: 'A', newValue: 'B' }] }),
    );
    expect(entries).toEqual([]);
  });

  it('新值等於舊值，即使追蹤開關為真也不產生記錄', () => {
    const entries = recordFieldChange(
      baseInput({ changes: [{ fieldName: 'status', oldValue: '待處理', newValue: '待處理' }] }),
    );
    expect(entries).toEqual([]);
  });

  it('oldValue 與 newValue 皆為 null，不產生記錄', () => {
    const entries = recordFieldChange(
      baseInput({ changes: [{ fieldName: 'status', oldValue: null, newValue: null }] }),
    );
    expect(entries).toEqual([]);
  });

  it('一次多欄異動，部分追蹤部分不追蹤，只有追蹤欄位各自產生記錄且順序與輸入一致', () => {
    const entries = recordFieldChange(
      baseInput({
        changes: [
          { fieldName: 'title', oldValue: 'A', newValue: 'B' },
          { fieldName: 'status', oldValue: '待處理', newValue: '處理中' },
        ],
      }),
    );
    expect(entries).toEqual([
      { fieldName: 'status', oldValue: '待處理', newValue: '處理中', actor: 'account-1', time: 1000 },
    ]);
  });

  it('changes 為空陣列，回傳空陣列', () => {
    expect(recordFieldChange(baseInput())).toEqual([]);
  });

  it('oldValue 為 null、newValue 有值，對應建立工單情境，正常產生記錄', () => {
    const entries = recordFieldChange(
      baseInput({ changes: [{ fieldName: 'status', oldValue: null, newValue: '待處理' }] }),
    );
    expect(entries).toEqual([
      { fieldName: 'status', oldValue: null, newValue: '待處理', actor: 'account-1', time: 1000 },
    ]);
  });

  it('newValue 為 null、oldValue 有值，對應清除欄位情境，清除本身算一次異動', () => {
    const entries = recordFieldChange(
      baseInput({ changes: [{ fieldName: 'status', oldValue: '待處理', newValue: null }] }),
    );
    expect(entries).toEqual([
      { fieldName: 'status', oldValue: '待處理', newValue: null, actor: 'account-1', time: 1000 },
    ]);
  });

  it('fieldDefs 查無對應欄位定義，視同不追蹤，不產生記錄、不擲錯', () => {
    const entries = recordFieldChange(
      baseInput({ changes: [{ fieldName: 'unknown_field', oldValue: 'A', newValue: 'B' }] }),
    );
    expect(entries).toEqual([]);
  });
});
