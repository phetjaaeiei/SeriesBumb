import type { SqlClient } from '../db/sql-client';
import type { ReleaseType, SearchKind } from '../domain/enums';
import { decadeOf, toCeYear, yearSortOf } from '../domain/format';
import { slugCandidates, SLUG_MAX, SLUG_RE } from '../domain/slug';
import { thaiSortKey } from '../domain/thai';
import { reindexArtistDependents, reindexLabelDependents } from './search-admin';
import { CatalogError } from './catalog-delete';
import { assertEntityImageKey } from './image-keys';
import { normalizeSearchField, searchDocument } from '../domain/search';
import type { ImageKind } from './images';
import type { ImageStore } from '../storage/image-store';
import { getCatalogIdBySlug, type CatalogSlugTable } from '../repositories/admin.repo';
import {
  deleteArtistMembersStmt, getArtistForSave, insertArtistMembersStmt, insertArtistStmt, listArtistMemberLinks, listArtistNamesByIds,
  listArtistNameSlugsByIds, refreshArtistPublishedTapeCountsStmt, updateArtistStmt,
} from '../repositories/artists.repo';
import {
  deleteCollectionItemsStmt, getCollectionSlug, insertCollectionItemsStmt, insertCollectionStmt, updateCollectionStmt,
} from '../repositories/collections.repo';
import { getGenreSlug, insertGenre, refreshGenrePublishedTapeCountsStmt, updateGenreStmt } from '../repositories/genres.repo';
import { listTapeImagesForSave, reorderTapeImagesStmt } from '../repositories/images.repo';
import { getLabelForSave, getLabelName, insertLabelStmt, refreshLabelPublishedTapeCountsStmt, updateLabelStmt } from '../repositories/labels.repo';
import { moveRedirectStmts } from '../repositories/redirects.repo';
import {
  indexSearchDocStmts, refreshArtistSearchVisibilityStmt, refreshLabelSearchVisibilityStmt, refreshSongSearchVisibilityStmt,
} from '../repositories/search.repo';
import {
  deleteSongArtistsStmt, getSongForSave, insertSongArtistStmt, insertSongArtistsStmt, insertSongStmt, listArtistIdsOfSongs,
  listSongArtistLinks, refreshSongPublishedTapeCountsStmt, updateSongStmt,
} from '../repositories/songs.repo';
import { adjustImageBytesStmt, adjustPublishedTapeCountStmt, incrementSongCountStmt, incrementTapeCountStmt } from '../repositories/stats.repo';
import {
  deleteTapeArtistsStmt, deleteTapeGenresStmt, deleteTapeTracksStmt, getTapeForSave, insertTapeArtistsStmt, insertTapeDraftStmt,
  insertTapeGenresStmt, insertTapeTracksStmt, listTapeArtistLinks, listTapeGenreLinks, listTapeTrackSongLinks, updateTapeStmt,
} from '../repositories/tapes.repo';

function requiredName(value: string, label: string): string {
  const name = value.trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > 200) throw new Error(`${label}ต้องมี 1–200 ตัวอักษร`);
  return name;
}

async function uniqueSlug(db: SqlClient, table: CatalogSlugTable, name: string, desired?: string | null, id?: string, options?: { year?: number | null; qualifierSlug?: string | null }): Promise<string> {
  if (desired) {
    if (!SLUG_RE.test(desired) || [...desired].length > SLUG_MAX) throw new Error('รูปแบบลิงก์ไม่ถูกต้อง');
    const row = await getCatalogIdBySlug(db, table, desired);
    if (row && row.id !== id) throw new Error('ลิงก์นี้ถูกใช้แล้ว');
    return desired;
  }
  const candidates = slugCandidates(name, options);
  for (const candidate of candidates) {
    const row = await getCatalogIdBySlug(db, table, candidate);
    if (!row || row.id === id) return candidate;
  }
  return `item-${crypto.randomUUID().slice(0, 8)}`;
}

function indexStatements(db: SqlClient, kind: SearchKind, refId: string, name: string, text: string, isPublic: boolean): D1PreparedStatement[] {
  const normalized = searchDocument(text.split(' | '));
  return indexSearchDocStmts(db, kind, refId, isPublic, normalizeSearchField(name), normalized);
}

function redirectStatements(db: SqlClient, oldPath: string, newPath: string): D1PreparedStatement[] {
  if (oldPath === newPath) return [];
  return moveRedirectStmts(db, oldPath, newPath, Date.now());
}

export async function createArtist(db: SqlClient, userId: string, nameInput: string) {
  const name = requiredName(nameInput, 'ชื่อศิลปิน');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'artist', name);
  const now = Date.now();
  await db.batch([
    insertArtistStmt(db, { id, slug, name, nameSort: thaiSortKey(name), userId, now }),
    ...indexStatements(db, 'artist', id, name, name, false),
  ]);
  return { id, slug };
}

export async function createLabel(db: SqlClient, userId: string, nameInput: string) {
  const name = requiredName(nameInput, 'ชื่อค่าย');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'label', name);
  const now = Date.now();
  await db.batch([
    insertLabelStmt(db, { id, slug, name, nameSort: thaiSortKey(name), userId, now }),
    ...indexStatements(db, 'label', id, name, name, false),
  ]);
  return { id, slug };
}

export async function createGenre(db: SqlClient, nameInput: string) {
  const name = requiredName(nameInput, 'ชื่อแนวเพลง');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'genre', name);
  await insertGenre(db, id, slug, name);
  return { id, slug };
}

export async function createSong(db: SqlClient, userId: string, input: { title: string; artistIds?: string[]; lyrics?: string | null }) {
  const title = requiredName(input.title, 'ชื่อเพลง');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'song', title);
  const now = Date.now();
  const artistIds = [...new Set(input.artistIds ?? [])].slice(0, 20);
  const singers = artistIds.length ? await listArtistNamesByIds(db, artistIds) : [];
  await db.batch([
    insertSongStmt(db, { id, slug, title, titleSort: thaiSortKey(title), lyrics: input.lyrics ?? null, userId, now }),
    ...artistIds.map((artistId, position) => insertSongArtistStmt(db, id, artistId, position)),
    incrementSongCountStmt(db, now),
    ...indexStatements(db, 'song', id, title, `${title} | ${singers.map(row => row.name).join(' | ')}`, false),
  ]);
  return { id, slug };
}

export async function createTapeDraft(db: SqlClient, userId: string, titleInput?: string) {
  const id = crypto.randomUUID();
  const title = titleInput?.trim() || '(ร่างไม่มีชื่อ)';
  const slug = `draft-${id.slice(0, 8)}`;
  const now = Date.now();
  await db.batch([
    insertTapeDraftStmt(db, { id, slug, title, titleSort: thaiSortKey(title), userId, now }),
    incrementTapeCountStmt(db, now),
    ...indexStatements(db, 'tape', id, title, title, false),
  ]);
  return { id, slug };
}

export interface TapeSaveInput {
  id: string;
  title: string;
  titleAlt?: string | null;
  slug?: string | null;
  year?: number | null;
  releaseType: ReleaseType;
  catalogNo?: string | null;
  description?: string;
  reelUrl?: string | null;
  isRare?: boolean;
  labelId?: string | null;
  artistIds?: string[];
  genreIds?: string[];
  tracks?: { songId: string; side: 'A' | 'B' | 'C' | 'D'; position: number; durationSec?: number | null; note?: string | null }[];
  images?: { id: string; kind: ImageKind }[];
  status: 'draft' | 'published';
  ogImageKey?: string | null;
  ogSourceImageId?: string | null;
  ogSourceTitle?: string | null;
}

export async function saveTape(db: SqlClient, userId: string, input: TapeSaveInput, bucket?: ImageStore, waitUntil?: (promise: Promise<unknown>) => void) {
  const title = requiredName(input.title, 'ชื่อเทป');
  const current = await getTapeForSave(db, input.id);
  if (!current) throw new Error('ไม่พบเทปนี้');
  const artistIds = [...new Set(input.artistIds ?? [])];
  const genreIds = [...new Set(input.genreIds ?? [])];
  const tracks = input.tracks ?? [];
  if (artistIds.length > 20 || tracks.length > 60) throw new Error('จำนวนศิลปินหรือเพลงเกินขีดจำกัด');
  if (input.status === 'published' && !artistIds.length && !['compilation', 'soundtrack'].includes(input.releaseType)) throw new Error('กรุณาระบุศิลปินก่อนเผยแพร่');
  const images = await listTapeImagesForSave(db, input.id);
  if (input.images) {
    const storedIds = new Set(images.map(image => image.id));
    const submittedIds = input.images.map(image => image.id);
    if (submittedIds.length !== storedIds.size || new Set(submittedIds).size !== storedIds.size || submittedIds.some(id => !storedIds.has(id))) {
      throw new CatalogError('รายการรูปเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก');
    }
  }
  const orderedImages = input.images
    ? input.images.map(image => ({ ...images.find(stored => stored.id === image.id)!, kind: image.kind }))
    : images;
  const cover = orderedImages.find(image => image.kind === 'front') || orderedImages[0];
  if (input.status === 'published' && !cover) throw new Error('กรุณาเพิ่มรูปปกก่อนเผยแพร่');
  const old = await Promise.all([
    listTapeArtistLinks(db, input.id),
    listTapeGenreLinks(db, input.id),
    listTapeTrackSongLinks(db, input.id),
  ]);
  const affectedGenres = [...new Set([...old[1].map(row => row.genreId), ...genreIds])];
  const affectedSongs = [...new Set([...old[2].map(row => row.songId), ...tracks.map(track => track.songId)])];
  const songArtists = affectedSongs.length ? await listArtistIdsOfSongs(db, affectedSongs) : [];
  const affectedArtists = [...new Set([...old[0].map(row => row.artistId), ...artistIds, ...songArtists.map(row => row.artistId)])];
  const affectedLabels = [...new Set([current.labelId, input.labelId].filter((value): value is string => !!value))];
  const year = input.year == null ? null : toCeYear(input.year);
  if (year != null && (year < 1950 || year > new Date().getFullYear() + 1)) throw new Error('ปีที่ออกเทปไม่ถูกต้อง');
  const names = artistIds.length ? await listArtistNameSlugsByIds(db, artistIds) : [];
  const customSlug = input.slug || undefined;
  const autoSlug = current.publishedAt === null && !current.slugLocked && !customSlug;
  const slug = customSlug || autoSlug
    ? await uniqueSlug(db, 'tape', title, customSlug, input.id, {
      year,
      qualifierSlug: names.find(row => row.id === artistIds[0])?.slug,
    })
    : current.slug;
  const slugLocked = customSlug ? 1 : current.slugLocked;
  const nextOgKey = input.ogImageKey === undefined ? current.ogImageKey : input.ogImageKey;
  let nextOgBytes = current.ogImageBytes;
  if (nextOgKey !== current.ogImageKey) {
    if (nextOgKey) {
      if (!bucket || !nextOgKey.startsWith(`tapes/${input.id}/`) || !/-og\.jpg$/u.test(nextOgKey)) throw new Error('รูปแชร์ไม่ถูกต้อง');
      const object = await bucket.head(nextOgKey);
      if (!object || object.size > 3 * 1024 * 1024) throw new Error('ไม่พบรูปแชร์ที่อัปโหลด');
      nextOgBytes = object.size;
    } else nextOgBytes = 0;
  }
  const nextOgSourceImageId = nextOgKey ? input.ogSourceImageId === undefined ? current.ogSourceImageId : input.ogSourceImageId : null;
  const nextOgSourceTitle = nextOgKey ? input.ogSourceTitle === undefined ? current.ogSourceTitle : input.ogSourceTitle : null;
  const now = Date.now();
  const publishedAt = input.status === 'published' ? current.publishedAt ?? now : current.publishedAt;
  const labelName = input.labelId ? await getLabelName(db, input.labelId) : null;
  const searchText = [title, input.titleAlt, ...names.map(row => row.name), labelName?.name, input.catalogNo].filter(Boolean).join(' | ');
  const relationPublished = Number(input.status === 'published');
  const statements: D1PreparedStatement[] = [
    ...(input.images ? [reorderTapeImagesStmt(db, input.id, input.images.map((image, position) => ({ ...image, position })))] : []),
    updateTapeStmt(db, {
      slug, slugLocked, title, titleAlt: input.titleAlt || null, titleSort: thaiSortKey(title), labelId: input.labelId || null, year,
      yearSort: yearSortOf(year), decade: decadeOf(year), releaseType: input.releaseType, catalogNo: input.catalogNo || null,
      description: input.description || '', reelUrl: input.reelUrl || null, isRare: Number(!!input.isRare), status: input.status, publishedAt,
      coverImageId: cover?.id || null, coverThumbKey: cover?.thumbKey || null, ogImageKey: nextOgKey, ogImageBytes: nextOgBytes,
      ogSourceImageId: nextOgSourceImageId, ogSourceTitle: nextOgSourceTitle, userId, now, id: input.id,
    }),
    deleteTapeArtistsStmt(db, input.id),
    insertTapeArtistsStmt(db, input.id, relationPublished, yearSortOf(year), artistIds),
    deleteTapeGenresStmt(db, input.id),
    insertTapeGenresStmt(db, input.id, relationPublished, publishedAt, genreIds),
    deleteTapeTracksStmt(db, input.id),
    insertTapeTracksStmt(db, input.id, tracks.map(track => ({ ...track, id: crypto.randomUUID() }))),
    adjustPublishedTapeCountStmt(db, Number(input.status === 'published') - Number(current.status === 'published'), now),
  ];
  if (nextOgBytes !== current.ogImageBytes) statements.push(adjustImageBytesStmt(db, nextOgBytes - current.ogImageBytes, now));
  if (affectedSongs.length) statements.push(refreshSongPublishedTapeCountsStmt(db, affectedSongs));
  if (affectedArtists.length) statements.push(refreshArtistPublishedTapeCountsStmt(db, affectedArtists));
  if (affectedLabels.length) statements.push(refreshLabelPublishedTapeCountsStmt(db, affectedLabels));
  if (affectedGenres.length) statements.push(refreshGenrePublishedTapeCountsStmt(db, affectedGenres));
  statements.push(...indexStatements(db, 'tape', input.id, title, searchText, input.status === 'published'));
  if (affectedSongs.length) statements.push(refreshSongSearchVisibilityStmt(db, affectedSongs));
  if (affectedArtists.length) statements.push(refreshArtistSearchVisibilityStmt(db, affectedArtists));
  if (affectedLabels.length) statements.push(refreshLabelSearchVisibilityStmt(db, affectedLabels));
  statements.push(...redirectStatements(db, `/tapes/${current.slug}`, `/tapes/${slug}`));
  await db.batch(statements);
  if (current.ogImageKey && current.ogImageKey !== nextOgKey && bucket) {
    if (waitUntil) waitUntil(bucket.delete(current.ogImageKey));
    else await bucket.delete(current.ogImageKey);
  }
  return { id: input.id, slug, status: input.status };
}

export async function saveArtist(db: SqlClient, userId: string, input: {
  id: string; name: string; nameAlt?: string | null; slug?: string | null;
  artistType?: 'band' | 'solo' | 'group' | null;
  status?: 'active' | 'inactive' | 'hiatus' | 'deceased' | 'unknown';
  province?: string | null; formedYear?: number | null; themes?: string | null; yearsActive?: string | null; bio?: string;
  imageKey?: string | null;
  members?: { id?: string; name: string; role?: string; years?: string | null; isCurrent?: boolean }[];
}) {
  const name = requiredName(input.name, 'ชื่อศิลปิน');
  const old = await getArtistForSave(db, input.id);
  if (!old) throw new Error('ไม่พบศิลปินนี้');
  const slug = input.slug ? await uniqueSlug(db, 'artist', name, input.slug, input.id) : old.slug;
  const previousMembers = await listArtistMemberLinks(db, input.id);
  const previousById = new Map(previousMembers.map(member => [member.id, member]));
  const seenMembers = new Set<string>();
  const members = (input.members ?? []).slice(0, 40).map((member, position) => {
    const previous = member.id ? previousById.get(member.id) : undefined;
    if (member.id && !previous) throw new Error('สมาชิกวงไม่ตรงกับศิลปิน');
    const id = previous?.id ?? crypto.randomUUID();
    if (seenMembers.has(id)) throw new Error('สมาชิกวงซ้ำ');
    seenMembers.add(id);
    return { id, personId: previous?.personId ?? null, sourceId: previous?.sourceId ?? null, name: requiredName(member.name, 'ชื่อสมาชิก'), role: member.role || '', years: member.years || null, isCurrent: Number(!!member.isCurrent), position };
  });
  const now = Date.now();
  await db.batch([
    updateArtistStmt(db, {
      slug, name, nameAlt: input.nameAlt || null, nameSort: thaiSortKey(name), artistType: input.artistType || null, status: input.status || 'unknown',
      province: input.province || null, formedYear: input.formedYear == null ? null : toCeYear(input.formedYear), themes: input.themes || null,
      yearsActive: input.yearsActive || null, bio: input.bio || '', imageKey: assertEntityImageKey('artists', input.id, input.imageKey), userId, now, id: input.id,
    }),
    deleteArtistMembersStmt(db, input.id),
    insertArtistMembersStmt(db, input.id, members),
    ...indexStatements(db, 'artist', input.id, name, [name, input.nameAlt, ...members.map(member => member.name)].filter(Boolean).join(' | '), old.publishedTapeCount > 0 || old.hasPublicSong === 1),
    ...redirectStatements(db, `/artists/${old.slug}`, `/artists/${slug}`),
  ]);
  if (name !== old.name) await reindexArtistDependents(db, input.id);
  return { id: input.id, slug };
}

export async function saveLabel(db: SqlClient, userId: string, input: {
  id: string; name: string; nameAlt?: string | null; slug?: string | null;
  description?: string; logoKey?: string | null;
}) {
  const name = requiredName(input.name, 'ชื่อค่าย');
  const old = await getLabelForSave(db, input.id);
  if (!old) throw new Error('ไม่พบค่ายนี้');
  const slug = input.slug ? await uniqueSlug(db, 'label', name, input.slug, input.id) : old.slug;
  await db.batch([
    updateLabelStmt(db, {
      slug, name, nameAlt: input.nameAlt || null, nameSort: thaiSortKey(name), description: input.description || '',
      logoKey: assertEntityImageKey('labels', input.id, input.logoKey), userId, now: Date.now(), id: input.id,
    }),
    ...indexStatements(db, 'label', input.id, name, [name, input.nameAlt].filter(Boolean).join(' | '), old.publishedTapeCount > 0),
    ...redirectStatements(db, `/labels/${old.slug}`, `/labels/${slug}`),
  ]);
  if (name !== old.name) await reindexLabelDependents(db, input.id);
  return { id: input.id, slug };
}

export async function saveSong(db: SqlClient, userId: string, input: {
  id: string; title: string; titleAlt?: string | null; slug?: string | null;
  artistIds?: string[]; lyricist?: string | null; composer?: string | null;
  arranger?: string | null; lyrics?: string | null; notes?: string | null; isPublic?: boolean;
}) {
  const title = requiredName(input.title, 'ชื่อเพลง');
  const old = await getSongForSave(db, input.id);
  if (!old) throw new Error('ไม่พบเพลงนี้');
  const slug = input.slug ? await uniqueSlug(db, 'song', title, input.slug, input.id) : old.slug;
  const oldArtists = await listSongArtistLinks(db, input.id);
  const artistIds = [...new Set(input.artistIds ?? [])].slice(0, 20);
  const affectedArtists = [...new Set([...oldArtists.map(row => row.artistId), ...artistIds])];
  const isPublic = input.isPublic === undefined ? Boolean(old.isPublic) : input.isPublic;
  const singers = artistIds.length ? await listArtistNamesByIds(db, artistIds) : [];
  const statements = [
    updateSongStmt(db, {
      slug, title, titleAlt: input.titleAlt || null, titleSort: thaiSortKey(title), lyricist: input.lyricist || null, composer: input.composer || null,
      arranger: input.arranger || null, lyrics: input.lyrics || null, notes: input.notes || null, isPublic: Number(isPublic), userId, now: Date.now(), id: input.id,
    }),
    deleteSongArtistsStmt(db, input.id),
    insertSongArtistsStmt(db, input.id, artistIds),
  ];
  if (affectedArtists.length) statements.push(refreshArtistPublishedTapeCountsStmt(db, affectedArtists));
  statements.push(...indexStatements(db, 'song', input.id, title, [title, input.titleAlt, ...singers.map(row => row.name), input.lyricist, input.composer].filter(Boolean).join(' | '), isPublic || old.publishedTapeCount > 0));
  if (affectedArtists.length) statements.push(refreshArtistSearchVisibilityStmt(db, affectedArtists));
  statements.push(...redirectStatements(db, `/songs/${old.slug}`, `/songs/${slug}`));
  await db.batch(statements);
  return { id: input.id, slug };
}

export async function saveGenre(db: SqlClient, input: { id: string; name: string; slug?: string | null; position?: number }) {
  const name = requiredName(input.name, 'ชื่อแนวเพลง');
  const old = await getGenreSlug(db, input.id);
  if (!old) throw new Error('ไม่พบแนวเพลงนี้');
  const slug = input.slug ? await uniqueSlug(db, 'genre', name, input.slug, input.id) : old.slug;
  await db.batch([
    updateGenreStmt(db, input.id, name, slug, input.position ?? null),
    ...redirectStatements(db, `/genres/${old.slug}`, `/genres/${slug}`),
  ]);
  return { id: input.id, slug };
}

export async function createCollection(db: SqlClient, userId: string, titleInput: string) {
  const title = requiredName(titleInput, 'ชื่อ Collection');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'collection', title);
  const now = Date.now();
  await db.batch([
    insertCollectionStmt(db, { id, slug, title, userId, now }),
    ...indexStatements(db, 'collection', id, title, title, false),
  ]);
  return { id, slug };
}

export async function saveCollection(db: SqlClient, userId: string, input: {
  id: string; title: string; slug?: string | null; description?: string;
  coverKey?: string | null; isFeatured?: boolean; status: 'draft' | 'published';
  items?: { tapeId: string; note?: string | null }[];
}) {
  const title = requiredName(input.title, 'ชื่อ Collection');
  const old = await getCollectionSlug(db, input.id);
  if (!old) throw new Error('ไม่พบ Collection นี้');
  const slug = input.slug ? await uniqueSlug(db, 'collection', title, input.slug, input.id) : old.slug;
  const items = (input.items ?? []).slice(0, 100).map((item, position) => ({ tapeId: item.tapeId, note: item.note || null, position }));
  await db.batch([
    updateCollectionStmt(db, {
      slug, title, description: input.description || '', coverKey: assertEntityImageKey('collections', input.id, input.coverKey),
      isFeatured: Number(!!input.isFeatured), status: input.status, userId, now: Date.now(), id: input.id,
    }),
    deleteCollectionItemsStmt(db, input.id),
    insertCollectionItemsStmt(db, input.id, items),
    ...indexStatements(db, 'collection', input.id, title, title, input.status === 'published'),
    ...redirectStatements(db, `/collections/${old.slug}`, `/collections/${slug}`),
  ]);
  return { id: input.id, slug };
}
