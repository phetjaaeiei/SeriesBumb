import type { SqlClient } from '../db/sql-client';
import type { SessionUser } from '../domain/types';
import { getPersonBySlug, listPublicPersonMemberships, type PersonMembershipRow, type PersonSummary } from '../repositories/people.repo';
import { publicCreditsForPerson } from '../services/person-credits';

export interface PersonDetailModel {
  person: PersonSummary;
  appearances: PersonMembershipRow[];
  credits: Awaited<ReturnType<typeof publicCreditsForPerson>>;
}

/** A person page; a person with no public membership or credit is shown to admins only. null when not found. */
export async function loadPersonDetail(sql: SqlClient, slug: string, viewer?: Pick<SessionUser, 'role'> | null): Promise<PersonDetailModel | null> {
  const person = await getPersonBySlug(sql, slug);
  if (!person) return null;
  const appearances = await listPublicPersonMemberships(sql, person.id);
  const credits = await publicCreditsForPerson(sql, person.id);
  if (!appearances.length && !credits.length && viewer?.role !== 'admin') return null;
  return { person, appearances, credits };
}
