import { AppError } from '../errors/app-error';
import type { SqlClient } from '../db/sql-client';
import type { SearchKind } from '../domain/enums';
import type { ImageStore } from '../storage/image-store';
import { runBatch } from '../repositories/batch.repo';
import { countArtistCredits, deleteArtistStmt, getArtistForDelete, refreshArtistPublishedTapeCountsStmt } from '../repositories/artists.repo';
import { deleteCollectionStmt, getCollectionForDelete } from '../repositories/collections.repo';
import { countGenreTapes, deleteGenreStmt, getGenreSlug, refreshGenrePublishedTapeCountsStmt } from '../repositories/genres.repo';
import { listTapeImageFiles } from '../repositories/images.repo';
import { countLabelTapes, deleteLabelStmt, getLabelForDelete, refreshOneLabelPublishedTapeCountStmt } from '../repositories/labels.repo';
import { deleteRedirectsForPathStmt } from '../repositories/redirects.repo';
import {
  refreshArtistSearchVisibilityStmt, refreshOneArtistSearchVisibilityStmt, refreshOneLabelSearchVisibilityStmt, refreshSongSearchVisibilityStmt,
  removeSearchDocStmts,
} from '../repositories/search.repo';
import { deleteSongStmt, getSongSlug, listSingerIdsOfSongs, listSongArtistLinks, listSongTapeTitles, refreshSongPublishedTapeCountsStmt } from '../repositories/songs.repo';
import { decrementSongCountStmt, recordTapeDeletedStmt, subtractImageBytesStmt } from '../repositories/stats.repo';
import { deleteTapeStmt, getTapeForDelete, listTapeArtistIdsUnordered, listTapeGenreIds, listTapeTrackSongIds } from '../repositories/tapes.repo';

type Kind = 'tapes' | 'songs' | 'artists' | 'labels' | 'genres' | 'collections';
export class CatalogError extends AppError {}

function removeIndex(db: SqlClient, kind: SearchKind, id: string, path: string): D1PreparedStatement[] {
  return [
    ...removeSearchDocStmts(db, kind, id),
    deleteRedirectsForPathStmt(db, path),
  ];
}

function thumbKeys(fullKey: string | null): string[] {
  if (!fullKey) return [];
  return [fullKey, fullKey.replace(/-full\.[^.]+$/u, '-thumb.webp'), fullKey.replace(/-full\.[^.]+$/u, '-thumb.jpg')];
}

export async function deleteCatalogEntity(db: SqlClient, bucket: ImageStore, kind: Kind, id: string, confirmation: string | undefined, waitUntil: (promise: Promise<unknown>) => void) {
  if (kind === 'tapes') {
    const tape = await getTapeForDelete(db, id);
    if (!tape) throw new CatalogError('ไม่พบเทปนี้');
    if (confirmation !== tape.title) throw new CatalogError('กรุณาพิมพ์ชื่อเทปให้ตรงก่อนลบ');
    const [artists, genres, songs, images] = await Promise.all([
      listTapeArtistIdsUnordered(db, id),
      listTapeGenreIds(db, id),
      listTapeTrackSongIds(db, id),
      listTapeImageFiles(db, id),
    ]);
    const songIds = [...new Set(songs)];
    const singerRows = songIds.length ? await listSingerIdsOfSongs(db, songIds) : [];
    const artistIds = [...new Set([...artists, ...singerRows.map(row => row.id)])];
    const genreIds = genres;
    const bytes = images.reduce((sum, image) => sum + image.bytes, tape.ogImageBytes);
    const now = Date.now();
    const statements: D1PreparedStatement[] = [
      ...removeIndex(db, 'tape', id, `/tapes/${tape.slug}`),
      deleteTapeStmt(db, id),
      recordTapeDeletedStmt(db, Number(tape.status === 'published'), bytes, now),
    ];
    if (songIds.length) {
      statements.push(refreshSongPublishedTapeCountsStmt(db, songIds));
      statements.push(refreshSongSearchVisibilityStmt(db, songIds));
    }
    if (artistIds.length) {
      statements.push(refreshArtistPublishedTapeCountsStmt(db, artistIds));
      statements.push(refreshArtistSearchVisibilityStmt(db, artistIds));
    }
    if (genreIds.length) statements.push(refreshGenrePublishedTapeCountsStmt(db, genreIds));
    if (tape.labelId) {
      statements.push(refreshOneLabelPublishedTapeCountStmt(db, tape.labelId));
      statements.push(refreshOneLabelSearchVisibilityStmt(db, tape.labelId));
    }
    await runBatch(db, statements);
    const keys = [...images.flatMap(image => [image.fullKey, image.thumbKey]), ...(tape.ogImageKey ? [tape.ogImageKey] : [])];
    if (keys.length) waitUntil(bucket.delete(keys));
    return { id, kind };
  }

  if (kind === 'songs') {
    const song = await getSongSlug(db, id);
    if (!song) throw new CatalogError('ไม่พบเพลงนี้');
    const linked = await listSongTapeTitles(db, id);
    if (linked.length) throw new CatalogError(`เพลงนี้ยังอยู่ในเทป: ${linked.map(row => row.title).join(', ')}`);
    const artists = await listSongArtistLinks(db, id);
    await runBatch(db, [
      ...removeIndex(db, 'song', id, `/songs/${song.slug}`),
      deleteSongStmt(db, id),
      decrementSongCountStmt(db, Date.now()),
      ...artists.map(row => refreshOneArtistSearchVisibilityStmt(db, row.artistId)),
    ]);
    return { id, kind };
  }

  if (kind === 'genres') {
    const genre = await getGenreSlug(db, id);
    if (!genre) throw new CatalogError('ไม่พบแนวเพลงนี้');
    const linked = await countGenreTapes(db, id);
    if (linked?.count) throw new CatalogError(`แนวเพลงนี้ยังผูกกับเทป ${linked.count} ชุด`);
    await runBatch(db, [deleteGenreStmt(db, id), deleteRedirectsForPathStmt(db, `/genres/${genre.slug}`)]);
    return { id, kind };
  }

  if (kind === 'artists' || kind === 'labels') {
    const row = kind === 'artists' ? await getArtistForDelete(db, id) : await getLabelForDelete(db, id);
    if (!row) throw new CatalogError(kind === 'artists' ? 'ไม่พบศิลปินนี้' : 'ไม่พบค่ายนี้');
    const linked = kind === 'artists'
      ? await countArtistCredits(db, id)
      : await countLabelTapes(db, id);
    if (linked?.count) throw new CatalogError(`รายการนี้ยังผูกกับข้อมูลอื่น ${linked.count} รายการ`);
    await runBatch(db, [...removeIndex(db, kind === 'artists' ? 'artist' : 'label', id, `/${kind}/${row.slug}`), kind === 'artists' ? deleteArtistStmt(db, id) : deleteLabelStmt(db, id), subtractImageBytesStmt(db, row.imageBytes, Date.now())]);
    if (row.imageKey) waitUntil(bucket.delete(thumbKeys(row.imageKey)));
    return { id, kind };
  }

  const collection = await getCollectionForDelete(db, id);
  if (!collection) throw new CatalogError('ไม่พบ Collection นี้');
  await runBatch(db, [...removeIndex(db, 'collection', id, `/collections/${collection.slug}`), deleteCollectionStmt(db, id), subtractImageBytesStmt(db, collection.imageBytes, Date.now())]);
  if (collection.coverKey) waitUntil(bucket.delete(thumbKeys(collection.coverKey)));
  return { id, kind };
}
