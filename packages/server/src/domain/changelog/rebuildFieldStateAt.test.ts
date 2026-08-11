import { describe, expect, it } from 'vitest';

import { rebuildFieldStateAt } from './rebuildFieldStateAt.js';
import type { ChangeLogRecord, RebuildFieldStateAtInput } from './types.js';

function baseInput(overrides: Partial<RebuildFieldStateAtInput> = {}): RebuildFieldStateAtInput {
  return {
    asOf: 1000,
    issueIds: ['issue-1'],
    fieldNames: ['status'],
    records: [],
    ...overrides,
  };
}

describe('rebuildFieldStateAt', () => {
  it('欄位有一筆早於目標時點的記錄，回傳該筆新值', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '處理中', time: 500 },
    ];
    const result = rebuildFieldStateAt(baseInput({ records }));
    expect(result).toEqual([
      { issueId: 'issue-1', fieldName: 'status', hasValue: true, value: '處理中' },
    ]);
  });

  it('欄位有多筆記錄，取不晚於目標時點裡最後一筆，不是取第一筆也不是取全域最新', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '待處理', time: 100 },
      { issueId: 'issue-1', fieldName: 'status', newValue: '處理中', time: 500 },
      { issueId: 'issue-1', fieldName: 'status', newValue: '已完成', time: 1500 },
    ];
    const result = rebuildFieldStateAt(baseInput({ asOf: 1000, records }));
    expect(result).toEqual([
      { issueId: 'issue-1', fieldName: 'status', hasValue: true, value: '處理中' },
    ]);
  });

  it('記錄時間晚於目標時點，被排除', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '已完成', time: 1500 },
    ];
    const result = rebuildFieldStateAt(baseInput({ asOf: 1000, records }));
    expect(result).toEqual([{ issueId: 'issue-1', fieldName: 'status', hasValue: false }]);
  });

  it('記錄時間恰等於目標時點，納入計算，不晚於為 inclusive', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '處理中', time: 1000 },
    ];
    const result = rebuildFieldStateAt(baseInput({ asOf: 1000, records }));
    expect(result).toEqual([
      { issueId: 'issue-1', fieldName: 'status', hasValue: true, value: '處理中' },
    ]);
  });

  it('欄位於目標時點前無任何記錄，回傳 hasValue false', () => {
    const result = rebuildFieldStateAt(baseInput());
    expect(result).toEqual([{ issueId: 'issue-1', fieldName: 'status', hasValue: false }]);
  });

  it('輸入 records 未依時間排序，函式自行排序後仍得到正確結果', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '已完成', time: 900 },
      { issueId: 'issue-1', fieldName: 'status', newValue: '待處理', time: 100 },
      { issueId: 'issue-1', fieldName: 'status', newValue: '處理中', time: 500 },
    ];
    const result = rebuildFieldStateAt(baseInput({ asOf: 1000, records }));
    expect(result).toEqual([
      { issueId: 'issue-1', fieldName: 'status', hasValue: true, value: '已完成' },
    ]);
  });

  it('多工單、多欄位範圍，輸出涵蓋 issueIds x fieldNames 的完整組合', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '處理中', time: 100 },
      { issueId: 'issue-2', fieldName: 'assignee', newValue: '陳彥廷', time: 100 },
    ];
    const result = rebuildFieldStateAt(
      baseInput({
        issueIds: ['issue-1', 'issue-2'],
        fieldNames: ['status', 'assignee'],
        records,
      }),
    );
    expect(result).toEqual([
      { issueId: 'issue-1', fieldName: 'status', hasValue: true, value: '處理中' },
      { issueId: 'issue-1', fieldName: 'assignee', hasValue: false },
      { issueId: 'issue-2', fieldName: 'status', hasValue: false },
      { issueId: 'issue-2', fieldName: 'assignee', hasValue: true, value: '陳彥廷' },
    ]);
  });

  it('records 含範圍外的 issueId／fieldName，被忽略、不干擾範圍內結果', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '處理中', time: 100 },
      { issueId: 'issue-other', fieldName: 'status', newValue: '已完成', time: 100 },
      { issueId: 'issue-1', fieldName: 'title', newValue: '換標題', time: 100 },
    ];
    const result = rebuildFieldStateAt(baseInput({ records }));
    expect(result).toEqual([
      { issueId: 'issue-1', fieldName: 'status', hasValue: true, value: '處理中' },
    ]);
  });

  it('asOf 早於該工單所有記錄，該工單所有欄位皆 hasValue false', () => {
    const records: ChangeLogRecord[] = [
      { issueId: 'issue-1', fieldName: 'status', newValue: '處理中', time: 500 },
    ];
    const result = rebuildFieldStateAt(baseInput({ asOf: 100, records }));
    expect(result).toEqual([{ issueId: 'issue-1', fieldName: 'status', hasValue: false }]);
  });
});
