import type { SqlClient } from '../../db/sql-client';
import { getCatalogEntityTitle } from '../../repositories/admin.repo';
import { listCatalogSources, type CatalogSource, type SourceKind } from '../../services/catalog-sources';

export type { CatalogSource, SourceKind };

export interface AdminSourcesModel {
  kind: SourceKind;
  id: string;
  /** The artist's name or the tape's or song's title. */
  title: string;
  sources: CatalogSource[];
}

/** `/admin/sources?kind=&id=`: a record's catalog sources; null for a bad kind or id, or a missing record. */
export async function loadAdminSources(sql: SqlClient, params: URLSearchParams): Promise<AdminSourcesModel | null> {
  const kind = params.get('kind');
  const id = params.get('id') ?? '';
  if ((kind !== 'artist' && kind !== 'tape' && kind !== 'song') || !/^[0-9a-f-]{36}$/iu.test(id)) return null;
  const record = await getCatalogEntityTitle(sql, kind, id);
  if (!record) return null;
  const sources = await listCatalogSources(sql, kind, id);
  return { kind, id, title: record.title, sources };
}
