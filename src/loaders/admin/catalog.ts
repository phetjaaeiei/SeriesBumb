import type { SqlClient } from '../../db/sql-client';
import { getAdminCatalogPage, type AdminCatalogKind, type AdminCatalogRow } from '../../repositories/admin-catalog.repo';

export type { AdminCatalogKind, AdminCatalogRow };

export const ADMIN_CATALOG_KINDS: readonly AdminCatalogKind[] = ['tapes', 'songs', 'artists', 'labels', 'genres', 'collections'];

export const isAdminCatalogKind = (kind: string | undefined): kind is AdminCatalogKind => (ADMIN_CATALOG_KINDS as readonly (string | undefined)[]).includes(kind);

export interface AdminCatalogModel {
  kind: AdminCatalogKind;
  /** `?q=` trimmed to 100 characters. */
  query: string;
  status: 'all' | 'draft' | 'published';
  unlinked: boolean;
  items: AdminCatalogRow[];
  nextCursor: string | null;
}

/** One page of an admin catalog list (`/admin/<kind>`) with its filters; null for an unknown kind. */
export async function loadAdminCatalog(sql: SqlClient, kind: string | undefined, params: URLSearchParams): Promise<AdminCatalogModel | null> {
  if (!isAdminCatalogKind(kind)) return null;
  const query = (params.get('q') || '').trim().slice(0, 100);
  const requestedStatus = params.get('status');
  const status = requestedStatus === 'draft' || requestedStatus === 'published' ? requestedStatus : 'all';
  const unlinked = params.get('unlinked') === '1';
  const { items, nextCursor } = await getAdminCatalogPage(sql, {
    kind, query, status, unlinked, cursor: params.get('cursor'),
  });
  return { kind, query, status, unlinked, items, nextCursor };
}
