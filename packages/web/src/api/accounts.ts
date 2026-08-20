// 帳號 API · /api/accounts 之下的登入者自我管理端點
//
// 供 AppShell 帳號區的預設日曆選用使用。目前只有預設日曆一項，
// 其他自我管理端點（如改名）不在此輪範圍內，不預先封裝。

import { apiFetch } from './client';

export async function getMyDefaultCalendar(): Promise<string | null> {
  const res = await apiFetch<{ defaultCalendarName: string | null }>('/api/accounts/me');
  return res.defaultCalendarName;
}

export async function updateMyDefaultCalendar(
  defaultCalendarName: string | null,
): Promise<string | null> {
  const res = await apiFetch<{ defaultCalendarName: string | null }>('/api/accounts/me', {
    method: 'PATCH',
    body: { defaultCalendarName },
  });
  return res.defaultCalendarName;
}
