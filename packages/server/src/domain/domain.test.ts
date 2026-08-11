import { describe, expect, it } from 'vitest';

import * as domain from './index.js';
import { DomainError } from './shared/index.js';

// 匯出口的契約測試：業務行為的紅綠循環在各子目錄自己的測試檔展開，
// 本檔只守 api 與 db 層真正碰得到的那層界面——匯出口漏掉一個名字，
// 子目錄的測試照樣全綠，只有這裡會紅。

/** 各 domain 對外的行為進入點；漏匯出即在此擋下。 */
const EXPECTED_BEHAVIORS = [
  // relation
  'validateRelationTypeDefinition',
  'validateRelationTypeDeletion',
  'checkExclusiveConstraint',
  'checkAcyclicConstraint',
  'checkIssueSetBoundary',
  'validateRelationCreation',
  'computeIssueLevel',
  // rollup
  'computeRollupValue',
  'resolveEffectiveMode',
  'initializeRollupMode',
  'switchRollupMode',
  'refreshAutoRollup',
  'evaluateDeviation',
  // numbering
  'suggestIssueSetKey',
  'validateIssueSetKey',
  'assignIssueKey',
  'formatIssueKey',
  'takeNextSeq',
  // view
  'buildKanbanColumns',
  'assignSortPosition',
  'applyViewFilter',
  'admitNewContainerIssue',
  'resolveViewCalendar',
  'computeIssueDuration',
  // workflow
  'checkTransitionAllowed',
  'checkActorRole',
  'checkRequiredFieldsPresent',
  'checkResolutionRequiredForTerminal',
  'checkResolutionValueAllowed',
  'validateStatusTransition',
  'changeIssueStatus',
  // changelog
  'recordFieldChange',
  'rebuildFieldStateAt',
  // shared
  'isWorkingDay',
  'differenceInWorkingDays',
  'differenceInCalendarDays',
  'invalid',
] as const;

describe('domain 匯出口', () => {
  it.each(EXPECTED_BEHAVIORS)('匯出 %s 且為函式', (name) => {
    expect(domain[name]).toBeTypeOf('function');
  });

  it('匯出檢查結果的通過值', () => {
    expect(domain.valid).toEqual({ ok: true });
  });
});

describe('domain 錯誤模型', () => {
  // api 層要能以同一個 catch 處理所有 domain 的失敗，前提是擲出的都是 DomainError。
  it.each(['RollupError', 'RelationError', 'NumberingError', 'DateError'] as const)(
    '%s 繼承 DomainError 並帶 code',
    (name) => {
      const error = new domain[name]('X_CODE' as never, '訊息');

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('X_CODE');
      expect(error.name).toBe(name);
    },
  );
});
