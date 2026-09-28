import type { SqlClient } from '../db/sql-client';
import type { SessionUser } from '../domain/types';
import { getSongBySlug, hasUserLikedSong, listSongArtists, listSongPublishedTapes, type SongArtist, type SongDetail, type SongTapeRow } from '../repositories/songs.repo';
import { listCatalogSources, type CatalogSource } from '../services/catalog-sources';
import { listComments } from '../services/comments';
import { creditsForTarget } from '../services/person-credits';

export type { SongArtist, SongDetail, SongTapeRow };

export interface SongDetailModel {
  song: SongDetail;
  /** Whether guests can see the song (public or on a published tape); admins also get drafts. */
  publicSong: boolean;
  catalogSources: CatalogSource[];
  credits: Awaited<ReturnType<typeof creditsForTarget>>;
  artists: SongArtist[];
  /** Up to 100 published tapes that carry the song. */
  tapes: SongTapeRow[];
  /** Whether the signed-in viewer liked the song; always false for drafts and guests. */
  liked: boolean;
  /** The first page of comments; null for drafts. */
  firstComments: Awaited<ReturnType<typeof listComments>> | null;
}

/** A song page; admins also see songs nobody else can. null when not found. */
export async function loadSongDetail(sql: SqlClient, slug: string, viewer?: Pick<SessionUser, 'id' | 'role'> | null): Promise<SongDetailModel | null> {
  const admin = viewer?.role === 'admin';
  const song = await getSongBySlug(sql, slug, admin);
  if (!song) return null;
  const [catalogSources, credits] = await Promise.all([listCatalogSources(sql, 'song', song.id), creditsForTarget(sql, 'song', song.id)]);
  const publicSong = song.isPublic === 1 || song.publishedTapeCount > 0;
  const [artists, tapes] = await Promise.all([
    listSongArtists(sql, song.id),
    listSongPublishedTapes(sql, song.id),
  ]);
  const viewerId = viewer?.id;
  const liked = publicSong && viewerId ? await hasUserLikedSong(sql, viewerId, song.id) : false;
  const firstComments = publicSong ? await listComments(sql, { songId: song.id }, null, viewerId) : null;
  return { song, publicSong, catalogSources, credits, artists, tapes, liked, firstComments };
}
