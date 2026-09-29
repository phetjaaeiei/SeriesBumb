// The repository functions behind the catalog, delete, image and search-index services, run against
// the parity seed: the reads return the rows the services start from (or null), and the statement
// builders compose into batches that D1 accepts.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import { getCatalogIdBySlug } from '../../src/repositories/admin.repo';
import {
  countArtistCredits, getArtistForDelete, getArtistForSave, listArtistMemberLinks, listArtistNameSlugsByIds, listArtistNamesByIds,
  refreshArtistPublishedTapeCountsStmt,
} from '../../src/repositories/artists.repo';
import { getCollectionForDelete, getCollectionSlug } from '../../src/repositories/collections.repo';
import { countGenreTapes, getGenreSlug, refreshGenrePublishedTapeCountsStmt } from '../../src/repositories/genres.repo';
import {
  countTapeImages, getImageOwner, getOwnerImage, getTapeImageForDelete, getTapeImageIdByFullKey, listTapeImageFiles, listTapeImagesForSave,
} from '../../src/repositories/images.repo';
import { countLabelTapes, getLabelForDelete, getLabelForSave, getLabelName, refreshLabelPublishedTapeCountsStmt } from '../../src/repositories/labels.repo';
import { deleteRedirectsForPathStmt, getRedirectTarget, moveRedirectStmts } from '../../src/repositories/redirects.repo';
import {
  dequeueSearchRefs, enqueueSearchRefsStmt, listArtistSearchSources, listCollectionSearchSources, listLabelSearchSources, listQueuedSearchRefs,
  listSearchRefsAfter, listSongSearchSources, listTapeSearchSources, refreshArtistSearchVisibilityStmt, refreshSongSearchVisibilityStmt,
} from '../../src/repositories/search.repo';
import {
  getSongForSave, getSongSlug, listArtistIdsOfSongs, listSingerIdsOfSongs, listSongArtistLinks, listSongTapeTitles, refreshSongPublishedTapeCountsStmt,
} from '../../src/repositories/songs.repo';
import { getImageBytesRow, getReindexState } from '../../src/repositories/stats.repo';
import {
  getTapeForDelete, getTapeForSave, listTapeArtistIdsUnordered, listTapeArtistLinks, listTapeGenreLinks, listTapeTrackSongIds, listTapeTrackSongLinks,
} from '../../src/repositories/tapes.repo';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;
const all = async <T>(query: string) => (await env.DB.prepare(query).all<T>()).results;
const missingId = () => crypto.randomUUID();
const sorted = (values: string[]) => [...values].sort();

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('catalog write repositories', () => {
  it('finds which record already uses a slug, per table', async () => {
    const tape = await one<{ id: string; slug: string }>('SELECT id, slug FROM tape WHERE id = ?', seeded.tapeIds[0]);
    expect(await getCatalogIdBySlug(env.DB, 'tape', tape.slug)).toEqual({ id: tape.id });
    expect(await getCatalogIdBySlug(env.DB, 'artist', tape.slug)).toBeNull();
    expect(await getCatalogIdBySlug(env.DB, 'genre', 'no-such-slug')).toBeNull();
  });

  it('reads the tape rows saveTape and deleteCatalogEntity start from', async () => {
    const tapeId = seeded.tapeIds[0];
    const saved = await getTapeForSave(env.DB, tapeId);
    expect(saved).toMatchObject({ id: tapeId, status: 'published', slugLocked: 0, ogImageKey: null, ogImageBytes: 0, ogSourceImageId: null });
    expect(saved!.publishedAt).toEqual(expect.any(Number));
    expect(saved!.labelId).toEqual(expect.any(String));
    expect(await getTapeForDelete(env.DB, tapeId)).toMatchObject({ id: tapeId, title: 'อัลบั้ม รักเธอ 1', slug: saved!.slug, status: 'published', labelId: saved!.labelId, ogImageBytes: 0 });

    expect(await listTapeArtistLinks(env.DB, tapeId)).toEqual([{ artistId: seeded.artistIds[0] }]);
    expect(await listTapeArtistIdsUnordered(env.DB, tapeId)).toEqual([seeded.artistIds[0]]);
    expect(await listTapeGenreLinks(env.DB, tapeId)).toHaveLength(1);
    const trackSongs = seeded.songIds.slice(0, 4);
    expect(sorted((await listTapeTrackSongLinks(env.DB, tapeId)).map(row => row.songId))).toEqual(sorted(trackSongs));
    expect(sorted(await listTapeTrackSongIds(env.DB, tapeId))).toEqual(sorted(trackSongs));

    const missing = missingId();
    expect(await getTapeForSave(env.DB, missing)).toBeNull();
    expect(await getTapeForDelete(env.DB, missing)).toBeNull();
    expect(await listTapeArtistLinks(env.DB, missing)).toEqual([]);
  });

  it('reads tape images for saving, uploading and deleting', async () => {
    const tapeId = seeded.tapeIds[0];
    const [image] = await listTapeImagesForSave(env.DB, tapeId);
    expect(image).toMatchObject({ kind: 'front', thumbKey: `tapes/${tapeId}/front-thumb.webp` });
    expect(await listTapeImageFiles(env.DB, tapeId)).toEqual([{ fullKey: `tapes/${tapeId}/front-full.webp`, thumbKey: `tapes/${tapeId}/front-thumb.webp`, bytes: 100 }]);
    expect(await countTapeImages(env.DB, tapeId)).toEqual({ value: 1 });
    expect(await getTapeImageIdByFullKey(env.DB, `tapes/${tapeId}/front-full.webp`)).toEqual({ id: image.id });
    expect(await getTapeImageForDelete(env.DB, image.id)).toMatchObject({ id: image.id, tapeId, bytes: 100, status: 'published', ogSourceImageId: null, ogImageKey: null, ogImageBytes: 0 });

    const draftId = seeded.tapeIds[5];
    expect(await one<{ status: string }>('SELECT status FROM tape WHERE id = ?', draftId)).toEqual({ status: 'draft' });
    expect(await listTapeImagesForSave(env.DB, draftId)).toEqual([]);
    expect(await countTapeImages(env.DB, draftId)).toEqual({ value: 0 });
    expect(await getTapeImageIdByFullKey(env.DB, 'tapes/none/none-full.jpg')).toBeNull();
    expect(await getTapeImageForDelete(env.DB, missingId())).toBeNull();
  });

  it('reads image owners and their single image', async () => {
    const collection = await one<{ id: string }>('SELECT id FROM collection LIMIT 1');
    const labelId = (await getTapeForSave(env.DB, seeded.tapeIds[0]))!.labelId!;
    expect(await getImageOwner(env.DB, 'tape', seeded.tapeIds[0])).toEqual({ id: seeded.tapeIds[0] });
    expect(await getImageOwner(env.DB, 'artist', seeded.tapeIds[0])).toBeNull();
    expect(await getOwnerImage(env.DB, 'artist', 'imageKey', seeded.artistIds[0])).toEqual({ imageKey: null, imageBytes: 0 });
    expect(await getOwnerImage(env.DB, 'label', 'logoKey', labelId)).toEqual({ imageKey: null, imageBytes: 0 });
    expect(await getOwnerImage(env.DB, 'collection', 'coverKey', collection.id)).toEqual({ imageKey: null, imageBytes: 0 });
    expect(await getOwnerImage(env.DB, 'artist', 'imageKey', missingId())).toBeNull();
    expect(await getImageBytesRow(env.DB)).toEqual({ imageBytes: expect.any(Number) });
  });

  it('reads artists for saving and deleting', async () => {
    const [first, second] = seeded.artistIds;
    const artist = await getArtistForSave(env.DB, first);
    expect(artist).toMatchObject({ name: 'คาราบาว 1', slug: expect.any(String) });
    expect(artist!.publishedTapeCount).toBeGreaterThan(0);
    expect([0, 1]).toContain(artist!.hasPublicSong);
    const [member] = await listArtistMemberLinks(env.DB, first);
    expect(member).toEqual({ id: expect.any(String), personId: expect.any(String), sourceId: expect.any(String) });
    expect(await listArtistMemberLinks(env.DB, second)).toEqual([]);

    expect(sorted((await listArtistNamesByIds(env.DB, [first, second])).map(row => row.name))).toEqual(sorted(['คาราบาว 1', 'แกรนด์เอ็กซ์ 2']));
    expect(await listArtistNameSlugsByIds(env.DB, [first])).toEqual([{ id: first, name: 'คาราบาว 1', slug: artist!.slug }]);
    expect(await getArtistForDelete(env.DB, first)).toEqual({ slug: artist!.slug, imageKey: null, imageBytes: 0 });
    expect((await countArtistCredits(env.DB, first))!.count).toBeGreaterThan(0);

    const missing = missingId();
    expect(await getArtistForSave(env.DB, missing)).toBeNull();
    expect(await getArtistForDelete(env.DB, missing)).toBeNull();
    expect(await countArtistCredits(env.DB, missing)).toEqual({ count: 0 });
  });

  it('reads labels, genres and collections for saving and deleting', async () => {
    const tapeId = seeded.tapeIds[0];
    const labelId = (await getTapeForSave(env.DB, tapeId))!.labelId!;
    const label = await getLabelForSave(env.DB, labelId);
    expect(label!.name).toMatch(/^ค่ายเพลง /u);
    expect(label!.publishedTapeCount).toBeGreaterThan(0);
    expect(await getLabelName(env.DB, labelId)).toEqual({ name: label!.name });
    expect(await getLabelForDelete(env.DB, labelId)).toEqual({ slug: label!.slug, imageKey: null, imageBytes: 0 });
    expect((await countLabelTapes(env.DB, labelId))!.count).toBeGreaterThan(0);

    const [{ genreId }] = await listTapeGenreLinks(env.DB, tapeId);
    expect(await getGenreSlug(env.DB, genreId)).toEqual({ slug: expect.any(String) });
    expect((await countGenreTapes(env.DB, genreId))!.count).toBeGreaterThan(0);

    const collection = await one<{ id: string; slug: string }>('SELECT id, slug FROM collection LIMIT 1');
    expect(await getCollectionSlug(env.DB, collection.id)).toEqual({ slug: collection.slug });
    expect(await getCollectionForDelete(env.DB, collection.id)).toEqual({ slug: collection.slug, coverKey: null, imageBytes: 0 });

    const missing = missingId();
    expect(await getLabelForSave(env.DB, missing)).toBeNull();
    expect(await getLabelName(env.DB, missing)).toBeNull();
    expect(await getLabelForDelete(env.DB, missing)).toBeNull();
    expect(await getGenreSlug(env.DB, missing)).toBeNull();
    expect(await countGenreTapes(env.DB, missing)).toEqual({ count: 0 });
    expect(await getCollectionSlug(env.DB, missing)).toBeNull();
    expect(await getCollectionForDelete(env.DB, missing)).toBeNull();
  });

  it('reads songs for saving and deleting', async () => {
    const [firstSong, secondSong] = seeded.songIds;
    const song = await getSongForSave(env.DB, firstSong);
    expect(song).toMatchObject({ slug: expect.any(String), isPublic: expect.any(Number) });
    expect(song!.publishedTapeCount).toBeGreaterThan(0);
    expect(await getSongSlug(env.DB, firstSong)).toEqual({ slug: song!.slug });
    expect(await listSongArtistLinks(env.DB, firstSong)).toEqual([{ artistId: seeded.artistIds[0] }]);
    expect(sorted((await listArtistIdsOfSongs(env.DB, [firstSong, secondSong])).map(row => row.artistId))).toEqual(sorted(seeded.artistIds.slice(0, 2)));
    expect(sorted((await listSingerIdsOfSongs(env.DB, [firstSong, secondSong, firstSong])).map(row => row.id))).toEqual(sorted(seeded.artistIds.slice(0, 2)));
    expect(await listSongTapeTitles(env.DB, firstSong)).toEqual([{ title: 'อัลบั้ม รักเธอ 1' }]);
    // The last seeded song is on no tape.
    expect(await listSongTapeTitles(env.DB, seeded.songIds.at(-1)!)).toEqual([]);

    const missing = missingId();
    expect(await getSongForSave(env.DB, missing)).toBeNull();
    expect(await getSongSlug(env.DB, missing)).toBeNull();
    expect(await listArtistIdsOfSongs(env.DB, [missing])).toEqual([]);
  });

  it('reads the reindex state, the queue and the fields search documents are built from', async () => {
    const state = await getReindexState(env.DB);
    expect(state).toEqual({ reindexCursor: null, reindexDay: state!.reindexDay, reindexRowsWritten: expect.any(Number) });
    expect([null, new Date().toISOString().slice(0, 10)]).toContain(state!.reindexDay);
    expect(await listQueuedSearchRefs(env.DB, 200)).toEqual([]);

    const refs = await listSearchRefsAfter(env.DB, '', '');
    const { artists, collections, labels, songs, tapes } = SEED_SIZES.parity;
    expect(refs).toHaveLength(artists + collections + labels + songs + tapes);
    expect(refs[0].kind).toBe('artist');
    expect(refs.at(-1)!.kind).toBe('tape');
    expect(await listSearchRefsAfter(env.DB, refs.at(-1)!.kind, refs.at(-1)!.refId)).toEqual([]);

    const tapeId = seeded.tapeIds[0];
    expect(await listTapeSearchSources(env.DB, [tapeId])).toEqual([expect.objectContaining({ id: tapeId, title: 'อัลบั้ม รักเธอ 1', status: 'published', catalogNo: 'PAR-0001', artistNames: 'คาราบาว 1', labelName: expect.any(String) })]);
    expect(await listSongSearchSources(env.DB, [seeded.songIds[0]])).toEqual([expect.objectContaining({ id: seeded.songIds[0], singers: 'คาราบาว 1', composer: 'ผู้แต่งทดสอบ' })]);
    expect(await listArtistSearchSources(env.DB, [seeded.artistIds[0]])).toEqual([expect.objectContaining({ id: seeded.artistIds[0], name: 'คาราบาว 1', members: 'สมาชิกวง 1' })]);
    const labelId = (await getTapeForSave(env.DB, tapeId))!.labelId!;
    expect(await listLabelSearchSources(env.DB, [labelId])).toEqual([expect.objectContaining({ id: labelId, nameAlt: null })]);
    const collection = await one<{ id: string; title: string }>('SELECT id, title FROM collection LIMIT 1');
    expect(await listCollectionSearchSources(env.DB, [collection.id])).toEqual([{ id: collection.id, title: collection.title, status: 'published' }]);
    expect(await listTapeSearchSources(env.DB, [missingId()])).toEqual([]);
  });

  it('builds counter and visibility refreshes that leave a consistent catalog unchanged', async () => {
    const counters = () => all<Record<string, number>>(`SELECT
      (SELECT group_concat(publishedTapeCount) FROM (SELECT publishedTapeCount FROM artist ORDER BY id)) AS artists,
      (SELECT group_concat(publishedTapeCount) FROM (SELECT publishedTapeCount FROM song ORDER BY id)) AS songs,
      (SELECT group_concat(publishedTapeCount) FROM (SELECT publishedTapeCount FROM label ORDER BY id)) AS labels,
      (SELECT group_concat(publishedTapeCount) FROM (SELECT publishedTapeCount FROM genre ORDER BY id)) AS genres,
      (SELECT group_concat(isPublic) FROM (SELECT isPublic FROM search_doc ORDER BY kind, refId)) AS visibility`);
    const before = await counters();
    const labelIds = (await all<{ id: string }>('SELECT id FROM label')).map(row => row.id);
    const genreIds = (await all<{ id: string }>('SELECT id FROM genre')).map(row => row.id);
    await env.DB.batch([
      refreshSongPublishedTapeCountsStmt(env.DB, seeded.songIds),
      refreshArtistPublishedTapeCountsStmt(env.DB, seeded.artistIds),
      refreshLabelPublishedTapeCountsStmt(env.DB, labelIds),
      refreshGenrePublishedTapeCountsStmt(env.DB, genreIds),
      refreshSongSearchVisibilityStmt(env.DB, seeded.songIds),
      refreshArtistSearchVisibilityStmt(env.DB, seeded.artistIds),
    ]);
    expect(await counters()).toEqual(before);
  });

  it('builds queue and redirect statements that round-trip', async () => {
    const refs = [{ kind: 'tape' as const, refId: seeded.tapeIds[0] }, { kind: 'song' as const, refId: seeded.songIds[0] }];
    await env.DB.batch([enqueueSearchRefsStmt(env.DB, refs), enqueueSearchRefsStmt(env.DB, refs)]);
    expect(await listQueuedSearchRefs(env.DB, 200)).toEqual([refs[1], refs[0]]);
    expect(await listQueuedSearchRefs(env.DB, 1)).toEqual([refs[1]]);
    await dequeueSearchRefs(env.DB, refs);
    expect(await listQueuedSearchRefs(env.DB, 200)).toEqual([]);

    await env.DB.batch(moveRedirectStmts(env.DB, '/tapes/old-path', '/tapes/new-path', 1));
    expect(await getRedirectTarget(env.DB, '/tapes/old-path')).toEqual({ toPath: '/tapes/new-path' });
    await env.DB.batch([deleteRedirectsForPathStmt(env.DB, '/tapes/new-path')]);
    expect(await getRedirectTarget(env.DB, '/tapes/old-path')).toBeNull();
  });
});
