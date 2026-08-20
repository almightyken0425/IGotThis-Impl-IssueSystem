// 日曆 API · /api/calendars 之下的唯讀查詢
//
// 供新增檢視表單與帳號預設日曆選用的日曆選單使用。日曆定義的建立與改名
// （屬 typeAdmin 開關）不在此輪範圍內，不封裝。

import { apiFetch } from './client';
import type { WorkCalendar } from './types';

export async function listCalendars(): Promise<readonly WorkCalendar[]> {
  const res = await apiFetch<{ calendars: readonly WorkCalendar[] }>('/api/calendars');
  return res.calendars;
}
