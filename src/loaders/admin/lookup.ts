import type { SqlClient } from '../../db/sql-client';
import { normalizeThai } from '../../domain/thai';
import { lookupAdminChoices, type AdminChoice, type AdminLookupKind } from '../../repositories/admin.repo';

export type { AdminChoice, AdminLookupKind };

/** The admin pickers' lookup (`admin.lookup` action): up to 20 records whose name or title contains `query` after Thai normalization. */
export async function loadAdminLookup(sql: SqlClient, kind: AdminLookupKind, query: string): Promise<AdminChoice[]> {
  const term = `%${normalizeThai(query).replace(/[\\%_]/gu, '\\$&')}%`;
  return lookupAdminChoices(sql, kind, term);
}
