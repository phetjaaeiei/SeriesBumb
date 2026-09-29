import type { SqlClient } from '../../db/sql-client';
import { getAdminRecord, listAdminChoicesByIds, type AdminChoice, type AdminRecord } from '../../repositories/admin.repo';
import { listArtistMembersForEdit, type ArtistMemberEditRow } from '../../repositories/artists.repo';
import { listCollectionItemsForEdit, type CollectionItemEditRow } from '../../repositories/collections.repo';
import { listSongArtistIds } from '../../repositories/songs.repo';
import { listTapeArtistIds, listTapeGenreIds, listTapeImagesForEdit, listTapeTracksForEdit, type TapeImageEditRow, type TapeTrackEditRow } from '../../repositories/tapes.repo';
import { isAdminCatalogKind, type AdminCatalogKind } from './catalog';

export type { AdminChoice, AdminRecord, ArtistMemberEditRow, CollectionItemEditRow, TapeImageEditRow, TapeTrackEditRow };

export interface AdminEditorModel {
  kind: AdminCatalogKind;
  record: AdminRecord;
  /** Tape or song artists in credit order; empty for other kinds. */
  artistIds: string[];
  genreIds: string[];
  tracks: TapeTrackEditRow[];
  members: ArtistMemberEditRow[];
  items: CollectionItemEditRow[];
  images: TapeImageEditRow[];
  /** Labels for every id the editor's pickers start with. */
  selected: AdminChoice[];
}

/** One catalog record with the relations its admin editor edits (`/admin/<kind>/<id>`); null for an unknown kind or record. */
export async function loadAdminEditor(sql: SqlClient, kind: string | undefined, id: string | undefined): Promise<AdminEditorModel | null> {
  if (!isAdminCatalogKind(kind) || !id) return null;
  const record = await getAdminRecord(sql, kind, id);
  if (!record) return null;

  const artistIds = kind === 'tapes' ? await listTapeArtistIds(sql, id)
    : kind === 'songs' ? await listSongArtistIds(sql, id) : [];
  const genreIds = kind === 'tapes' ? await listTapeGenreIds(sql, id) : [];
  const tracks = kind === 'tapes' ? await listTapeTracksForEdit(sql, id) : [];
  const members = kind === 'artists' ? await listArtistMembersForEdit(sql, id) : [];
  const items = kind === 'collections' ? await listCollectionItemsForEdit(sql, id) : [];
  const images = kind === 'tapes' ? await listTapeImagesForEdit(sql, id) : [];
  const selectedIds = [...new Set([...artistIds, ...genreIds, ...tracks.map(row => String(row.songId)), ...items.map(row => String(row.tapeId)), ...[record.labelId].filter((value): value is string => typeof value === 'string')])];
  const selected = selectedIds.length ? await listAdminChoicesByIds(sql, selectedIds) : [];
  return { kind, record, artistIds, genreIds, tracks, members, items, images, selected };
}
