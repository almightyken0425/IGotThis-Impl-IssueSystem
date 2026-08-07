// 認證 API · /api/auth 之下的 register / login / logout / me
//
// 只做協定呼叫，回傳型別化結果；session 靠 httpOnly cookie 承載，前端不碰 token。

import { apiFetch } from './client';
import type { Account } from './types';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

interface AccountResponse {
  readonly account: Account;
}

/** 註冊帳號並發 session；回新帳號。email 已註冊時後端回 409。 */
export async function register(input: RegisterInput): Promise<Account> {
  const res = await apiFetch<AccountResponse>('/api/auth/register', {
    method: 'POST',
    body: input,
  });
  return res.account;
}

/** 登入並發 session；回帳號。憑證錯誤時後端回 401。 */
export async function login(input: LoginInput): Promise<Account> {
  const res = await apiFetch<AccountResponse>('/api/auth/login', { method: 'POST', body: input });
  return res.account;
}

/** 登出：刪 session、清 cookie。冪等。 */
export async function logout(): Promise<void> {
  await apiFetch<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}

/** 取當前帳號；無有效 session 時 apiFetch 拋 401。 */
export async function me(): Promise<Account> {
  const res = await apiFetch<AccountResponse>('/api/auth/me');
  return res.account;
}
