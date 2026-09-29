import type { SqlClient } from '../../db/sql-client';
import { getCatalogEntityTitle } from '../../repositories/admin.repo';
import { listArtistRelationsForAdmin, listRelationChoices, listTapeEditionsForAdmin, type ArtistRelationAdminRow, type RelationChoice, type TapeEditionAdminRow } from '../../repositories/relations.repo';
import { listSourceChoices, type SourceChoice } from '../../repositories/sources.repo';

export type { ArtistRelationAdminRow, RelationChoice, SourceChoice, TapeEditionAdminRow };

export interface AdminRelationsModel {
  kind: 'artist' | 'tape';
  id: string;
  title: string;
  choices: RelationChoice[];
  sources: SourceChoice[];
  /** Artist relations for an artist, other editions for a tape. */
  rows: ArtistRelationAdminRow[] | TapeEditionAdminRow[];
}

/** `/admin/relations?kind=&id=`: an artist's relations or a tape's editions, with choices and sources; null for a bad kind or id, or a missing record. */
export async function loadAdminRelations(sql: SqlClient, params: URLSearchParams): Promise<AdminRelationsModel | null> {
  const kind = params.get('kind');
  const id = params.get('id') ?? '';
  if ((kind !== 'artist' && kind !== 'tape') || !/^[0-9a-f-]{36}$/iu.test(id)) return null;
  const current = await getCatalogEntityTitle(sql, kind, id);
  if (!current) return null;
  const [choices, sources, rows] = await Promise.all([
    listRelationChoices(sql, kind),
    listSourceChoices(sql, kind, id),
    kind === 'artist' ? listArtistRelationsForAdmin(sql, id) : listTapeEditionsForAdmin(sql, id),
  ]);
  return { kind, id, title: current.title, choices, sources, rows };
}
