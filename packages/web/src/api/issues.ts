// 工單 API · /api/issues 之下的單張工單讀取：基本識別、欄位單值、異動歷史
//
// 供工單詳情頁使用。欄位單值的一般寫入（PUT /issues/:issueId/fields/:fieldName）
// 刻意不在此封裝：該路徑不記變更歷史，本頁的欄位編輯改走 workspace.ts 既有的
// PATCH（見 IssueDetailScreen 對編輯範圍的說明），此檔只承載讀取。

import { apiFetch } from './client';
import type { ChangeLogEntry, IssueFieldValue, IssueSummary } from './types';

/** 取單張工單的基本識別（不含欄位值）；查無時 apiFetch 對 404 拋 ApiError。 */
export async function getIssue(issueId: string): Promise<IssueSummary> {
  const res = await apiFetch<{ issue: IssueSummary }>(`/api/issues/${issueId}`);
  return res.issue;
}

/** 列出一張工單的全部單值欄位。 */
export async function listFieldValues(issueId: string): Promise<readonly IssueFieldValue[]> {
  const res = await apiFetch<{ fieldValues: readonly IssueFieldValue[] }>(
    `/api/issues/${issueId}/fields`,
  );
  return res.fieldValues;
}

/**
 * 後端 GET /issues/:issueId/changelog 的原始 wire 形狀：ChangeLog 是系統多筆
 * 欄位，單筆記錄的異動內容本體落在 value（對齊 domain 的 ChangeLogEntry）。
 * 本檔把它攤平成好用的 ChangeLogEntry（帶 id），畫面層不必穿透這層包裝。
 */
interface ChangeLogRecordWire {
  readonly id: string;
  readonly value: {
    readonly fieldName: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
    readonly actor: string;
    readonly time: number;
  };
}

/** 列出一張工單的異動歷史；伺服器端已依時間新到舊排序。 */
export async function listChangelog(issueId: string): Promise<readonly ChangeLogEntry[]> {
  const res = await apiFetch<{ changeLog: readonly ChangeLogRecordWire[] }>(
    `/api/issues/${issueId}/changelog`,
  );
  return res.changeLog.map((record) => ({ id: record.id, ...record.value }));
}
