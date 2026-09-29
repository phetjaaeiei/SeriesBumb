import type { SqlClient } from '../../db/sql-client';
import { getCreditTargetTitle } from '../../repositories/admin.repo';
import { creditsForTarget } from '../../repositories/credits.repo';
import { listPersonChoices, type PersonChoice } from '../../repositories/people.repo';
import { listSourceChoices, type SourceChoice } from '../../repositories/sources.repo';

export type { PersonChoice, SourceChoice };

export interface AdminCreditsModel {
  kind: 'tape' | 'song';
  id: string;
  title: string;
  people: PersonChoice[];
  sources: SourceChoice[];
  credits: Awaited<ReturnType<typeof creditsForTarget>>;
}

/** `/admin/credits?kind=&id=`: a tape's or song's person credits with the people and sources to add more; null for a bad kind or id, or a missing record. */
export async function loadAdminCredits(sql: SqlClient, params: URLSearchParams): Promise<AdminCreditsModel | null> {
  const kind = params.get('kind');
  const id = params.get('id') ?? '';
  if ((kind !== 'tape' && kind !== 'song') || !/^[0-9a-f-]{36}$/iu.test(id)) return null;
  const current = await getCreditTargetTitle(sql, kind, id);
  if (!current) return null;
  const [people, sources, credits] = await Promise.all([
    listPersonChoices(sql),
    listSourceChoices(sql, kind, id),
    creditsForTarget(sql, kind, id),
  ]);
  return { kind, id, title: current.title, people, sources, credits };
}
