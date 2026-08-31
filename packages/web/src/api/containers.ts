// 組織讀取、建立與改名。

import { apiFetch } from './client';
import type { IssueSet, Mgmt, Organization, Product, Team } from './types';

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

export function getOrganization(): Promise<Organization> {
  return apiFetch('/api/organization');
}

export async function createTeam(name: string): Promise<Team> {
  return (await apiFetch<{ team: Team }>('/api/teams', { method: 'POST', body: { name } })).team;
}

export async function createProduct(teamId: string, name: string): Promise<Product> {
  return (await apiFetch<{ product: Product }>('/api/products', { method: 'POST', body: { teamId, name } })).product;
}

export function createMgmt(productId: string, name: string, issueSet: { name: string; key: string }): Promise<{ mgmt: Mgmt; issueSet: IssueSet }> {
  return apiFetch(`/api/products/${productId}/mgmts`, { method: 'POST', body: { name, issueSet } });
}

export async function createIssueSet(mgmtId: string, name: string, key: string): Promise<IssueSet> {
  return (await apiFetch<{ issueSet: IssueSet }>(`/api/mgmts/${mgmtId}/issue-sets`, { method: 'POST', body: { name, key } })).issueSet;
}

export type ContainerKind = 'team' | 'product' | 'mgmt' | 'issueSet';
const CONTAINER_PATHS = { team: 'teams', product: 'products', mgmt: 'mgmts', issueSet: 'issue-sets' } as const;

export async function renameContainer(kind: ContainerKind, id: string, name: string): Promise<void> {
  await apiFetch(`/api/${CONTAINER_PATHS[kind]}/${id}`, { method: 'PATCH', body: { name } });
}
