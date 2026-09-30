import type { SqlClient } from '../../db/sql-client';
import { getArtistNameById, listArtistMembersForPersonLinks, type ArtistMemberLinkRow } from '../../repositories/artists.repo';
import { listPeopleForAdmin, type PersonAdminRow } from '../../repositories/people.repo';
import { listArtistSourceChoices, type SourceChoice } from '../../repositories/sources.repo';

export type { ArtistMemberLinkRow, PersonAdminRow, SourceChoice };

export interface AdminPeopleModel {
  /** The artist from `?artistId=` when it exists; its members and sources are listed. */
  artist: { id: string; name: string } | null;
  people: PersonAdminRow[];
  members: ArtistMemberLinkRow[];
  sources: SourceChoice[];
}

/** `/admin/people`: people to link, plus one artist's members and sources when `?artistId=` names one. */
export async function loadAdminPeople(sql: SqlClient, params: URLSearchParams): Promise<AdminPeopleModel> {
  const artistId = params.get('artistId');
  const artist = artistId ? await getArtistNameById(sql, artistId) : null;
  const [people, members, sources] = await Promise.all([
    listPeopleForAdmin(sql),
    artist ? listArtistMembersForPersonLinks(sql, artist.id) : Promise.resolve([] as ArtistMemberLinkRow[]),
    artist ? listArtistSourceChoices(sql, artist.id) : Promise.resolve([] as SourceChoice[]),
  ]);
  return { artist, people, members, sources };
}
