import type { SqlClient } from '../db/sql-client';
import { decodeCursor, encodeCursor } from '../domain/cursor';
import type { SessionUser } from '../domain/types';
import {
  artistHasPublicSong, getArtistBySlug, getArtistLastLabel, listArtistCompilationAppearances, listArtistMembers, listArtistReelLinks,
  listArtistSongs, listArtistTopGenres, listSimilarArtistsByGenre,
  type ArtistAppearanceRow, type ArtistDetail, type ArtistMemberRow, type ArtistReelLinkRow, type ArtistSongRow, type SimilarArtistRow,
} from '../repositories/artists.repo';
import { getTapePage, type TapeListItem } from '../repositories/tapes.repo';
import { publicArtistRelations } from '../services/catalog-relations';
import { listCatalogSources, type CatalogSource } from '../services/catalog-sources';

export type { ArtistDetail, ArtistMemberRow, ArtistSongRow };

export interface ArtistDetailModel {
  artist: ArtistDetail;
  /** Whether guests can see the artist (a published tape or a public song); admins also get drafts. */
  publicArtist: boolean;
  catalogSources: CatalogSource[];
  explicitRelations: Awaited<ReturnType<typeof publicArtistRelations>>;
  members: ArtistMemberRow[];
  /** One page of up to 100 songs from `?songs_cursor=`. */
  songs: ArtistSongRow[];
  nextSongCursor: string | null;
  genreNames: string[];
  lastLabel: { name: string; slug: string } | null;
  /** One page of up to 50 published tapes by year from `?cursor=`. */
  page: { items: TapeListItem[]; nextCursor: string | null };
  appearances: ArtistAppearanceRow[];
  similarArtists: SimilarArtistRow[];
  relatedLinks: ArtistReelLinkRow[];
}

/** An artist page; admins also see artists with nothing public yet. null when not found. */
export async function loadArtistDetail(sql: SqlClient, slug: string, params: URLSearchParams, viewer?: Pick<SessionUser, 'role'> | null): Promise<ArtistDetailModel | null> {
  const admin = viewer?.role === 'admin';
  const artist = await getArtistBySlug(sql, slug, admin);
  if (!artist) return null;
  const catalogSources = await listCatalogSources(sql, 'artist', artist.id);
  const explicitRelations = await publicArtistRelations(sql, artist.id);
  const hasPublicSong = await artistHasPublicSong(sql, artist.id);
  const publicArtist = artist.publishedTapeCount > 0 || hasPublicSong;
  const songCursor = decodeCursor('title', params.get('songs_cursor'));
  const [members, songs, genreRows, lastLabel] = await Promise.all([
    listArtistMembers(sql, artist.id),
    listArtistSongs(sql, artist.id, songCursor),
    listArtistTopGenres(sql, artist.id),
    getArtistLastLabel(sql, artist.id),
  ]);
  const page = await getTapePage(sql, { artistId: artist.id, sort: 'year', pageSize: 50, cursor: params.get('cursor') });
  const [appearances, similarArtists, relatedLinks] = await Promise.all([
    listArtistCompilationAppearances(sql, artist.id),
    listSimilarArtistsByGenre(sql, artist.id),
    listArtistReelLinks(sql, artist.id),
  ]);
  const visibleSongs = songs.slice(0, 100);
  const lastSong = visibleSongs.at(-1);
  const nextSongCursor = songs.length > 100 && lastSong ? encodeCursor('title', lastSong.titleSort, lastSong.id) : null;
  return {
    artist, publicArtist, catalogSources, explicitRelations, members, songs: visibleSongs, nextSongCursor,
    genreNames: genreRows.map(row => row.name), lastLabel, page, appearances, similarArtists, relatedLinks,
  };
}
