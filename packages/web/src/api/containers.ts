// 容器骨架 API · /api/teams、/api/products、/api/mgmts 之下的唯讀查詢
//
// 供新增檢視表單的組織範圍選擇器使用。這輪只需要唯讀列出，
// Team/Product/Mgmt 的建立與改名不在此輪範圍內，不封裝。

import { apiFetch } from './client';
import type { Mgmt, Product, Team } from './types';

export async function listTeams(): Promise<readonly Team[]> {
  const res = await apiFetch<{ teams: readonly Team[] }>('/api/teams');
  return res.teams;
}

export async function listProductsByTeam(teamId: string): Promise<readonly Product[]> {
  const res = await apiFetch<{ products: readonly Product[] }>(`/api/teams/${teamId}/products`);
  return res.products;
}

export async function listMgmtsByProduct(productId: string): Promise<readonly Mgmt[]> {
  const res = await apiFetch<{ mgmts: readonly Mgmt[] }>(`/api/products/${productId}/mgmts`);
  return res.mgmts;
}
