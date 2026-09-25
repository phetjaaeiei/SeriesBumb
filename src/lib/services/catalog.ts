import { jsonParam } from '../../db/client';
import type { ReleaseType } from '../../db/enums';
import { decadeOf, toCeYear, yearSortOf } from '../format';
import { slugCandidates, SLUG_MAX, SLUG_RE } from '../slug';
import { normalizeThai, thaiSortKey } from '../thai';
import { reindexArtistDependents, reindexLabelDependents } from './search-admin';

type EntityTable = 'artist' | 'label' | 'genre' | 'song' | 'tape' | 'collection';
type SearchKind = Exclude<EntityTable, 'genre'>;

function requiredName(value: string, label: string): string {
  const name = value.trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > 200) throw new Error(`${label}ต้องมี 1–200 ตัวอักษร`);
  return name;
}

async function uniqueSlug(db: D1Database, table: EntityTable, name: string, desired?: string | null, id?: string): Promise<string> {
  if (desired) {
    if (!SLUG_RE.test(desired) || [...desired].length > SLUG_MAX) throw new Error('รูปแบบลิงก์ไม่ถูกต้อง');
    const row = await db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).bind(desired).first<{ id: string }>();
    if (row && row.id !== id) throw new Error('ลิงก์นี้ถูกใช้แล้ว');
    return desired;
  }
  const candidates = slugCandidates(name);
  for (const candidate of candidates) {
    const row = await db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).bind(candidate).first<{ id: string }>();
    if (!row || row.id === id) return candidate;
  }
  return `item-${crypto.randomUUID().slice(0, 8)}`;
}

function indexStatements(db: D1Database, kind: SearchKind, refId: string, name: string, text: string, isPublic: boolean): D1PreparedStatement[] {
  const normalized = normalizeThai(text);
  return [
    db.prepare(`INSERT INTO search_doc (kind, refId, isPublic, nameKey) VALUES (?, ?, ?, ?) ON CONFLICT(kind, refId) DO UPDATE SET isPublic = excluded.isPublic, nameKey = excluded.nameKey`).bind(kind, refId, Number(isPublic), normalizeThai(name)),
    db.prepare('DELETE FROM search_fts WHERE rowid = (SELECT docId FROM search_doc WHERE kind = ? AND refId = ?)').bind(kind, refId),
    db.prepare('INSERT INTO search_fts (rowid, text) SELECT docId, ? FROM search_doc WHERE kind = ? AND refId = ?').bind(normalized, kind, refId),
  ];
}

function redirectStatements(db: D1Database, oldPath: string, newPath: string): D1PreparedStatement[] {
  if (oldPath === newPath) return [];
  return [
    db.prepare('DELETE FROM redirect WHERE fromPath = ?').bind(newPath),
    db.prepare('UPDATE redirect SET toPath = ? WHERE toPath = ?').bind(newPath, oldPath),
    db.prepare('INSERT OR REPLACE INTO redirect (fromPath, toPath, createdAt) VALUES (?, ?, ?)').bind(oldPath, newPath, Date.now()),
  ];
}

export async function createArtist(db: D1Database, userId: string, nameInput: string) {
  const name = requiredName(nameInput, 'ชื่อศิลปิน');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'artist', name);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO artist (id, slug, name, nameSort, status, bio, createdBy, createdAt, updatedBy, updatedAt) VALUES (?, ?, ?, ?, 'unknown', '', ?, ?, ?, ?)").bind(id, slug, name, thaiSortKey(name), userId, now, userId, now),
    ...indexStatements(db, 'artist', id, name, name, false),
  ]);
  return { id, slug };
}

export async function createLabel(db: D1Database, userId: string, nameInput: string) {
  const name = requiredName(nameInput, 'ชื่อค่าย');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'label', name);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO label (id, slug, name, nameSort, description, createdBy, createdAt, updatedBy, updatedAt) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)").bind(id, slug, name, thaiSortKey(name), userId, now, userId, now),
    ...indexStatements(db, 'label', id, name, name, false),
  ]);
  return { id, slug };
}

export async function createGenre(db: D1Database, nameInput: string) {
  const name = requiredName(nameInput, 'ชื่อแนวเพลง');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'genre', name);
  await db.prepare('INSERT INTO genre (id, slug, name, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM genre))').bind(id, slug, name).run();
  return { id, slug };
}

export async function createSong(db: D1Database, userId: string, input: { title: string; artistIds?: string[]; lyrics?: string | null }) {
  const title = requiredName(input.title, 'ชื่อเพลง');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'song', title);
  const now = Date.now();
  const artistIds = [...new Set(input.artistIds ?? [])].slice(0, 20);
  const singers = artistIds.length ? await db.prepare(`SELECT name FROM artist WHERE id IN (${artistIds.map(() => '?').join(',')})`).bind(...artistIds).all<{ name: string }>() : { results: [] as { name: string }[] };
  await db.batch([
    db.prepare('INSERT INTO song (id, slug, title, titleSort, lyrics, createdBy, createdAt, updatedBy, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, slug, title, thaiSortKey(title), input.lyrics ?? null, userId, now, userId, now),
    ...artistIds.map((artistId, position) => db.prepare('INSERT INTO song_artist (songId, artistId, position) VALUES (?, ?, ?)').bind(id, artistId, position)),
    db.prepare('UPDATE site_stats SET songCount = songCount + 1, updatedAt = ? WHERE id = 1').bind(now),
    ...indexStatements(db, 'song', id, title, `${title} | ${singers.results.map(row => row.name).join(' | ')}`, false),
  ]);
  return { id, slug };
}

export async function createTapeDraft(db: D1Database, userId: string, titleInput?: string) {
  const id = crypto.randomUUID();
  const title = titleInput?.trim() || '(ร่างไม่มีชื่อ)';
  const slug = `draft-${id.slice(0, 8)}`;
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, status, createdBy, createdAt, updatedBy, updatedAt) VALUES (?, ?, ?, ?, 'album', 'draft', ?, ?, ?, ?)").bind(id, slug, title, thaiSortKey(title), userId, now, userId, now),
    db.prepare('UPDATE site_stats SET tapeCount = tapeCount + 1, updatedAt = ? WHERE id = 1').bind(now),
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
  status: 'draft' | 'published';
  ogImageKey?: string | null;
}

export async function saveTape(db: D1Database, userId: string, input: TapeSaveInput) {
  const title = requiredName(input.title, 'ชื่อเทป');
  const current = await db.prepare('SELECT id, slug, status, publishedAt, labelId, coverImageId, ogImageKey FROM tape WHERE id = ?').bind(input.id).first<{ id: string; slug: string; status: 'draft' | 'published'; publishedAt: number | null; labelId: string | null; coverImageId: string | null; ogImageKey: string | null }>();
  if (!current) throw new Error('ไม่พบเทปนี้');
  const artistIds = [...new Set(input.artistIds ?? [])];
  const genreIds = [...new Set(input.genreIds ?? [])];
  const tracks = input.tracks ?? [];
  if (artistIds.length > 20 || tracks.length > 60) throw new Error('จำนวนศิลปินหรือเพลงเกินขีดจำกัด');
  if (input.status === 'published' && !artistIds.length && !['compilation', 'soundtrack'].includes(input.releaseType)) throw new Error('กรุณาระบุศิลปินก่อนเผยแพร่');
  const images = await db.prepare("SELECT id, kind, thumbKey FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1").bind(input.id).all<{ id: string; kind: string; thumbKey: string }>();
  const cover = images.results[0];
  if (input.status === 'published' && !cover) throw new Error('กรุณาเพิ่มรูปปกก่อนเผยแพร่');
  const old = await Promise.all([
    db.prepare('SELECT artistId FROM tape_artist WHERE tapeId = ?').bind(input.id).all<{ artistId: string }>(),
    db.prepare('SELECT genreId FROM tape_genre WHERE tapeId = ?').bind(input.id).all<{ genreId: string }>(),
    db.prepare('SELECT songId FROM tape_track WHERE tapeId = ?').bind(input.id).all<{ songId: string }>(),
  ]);
  const affectedGenres = [...new Set([...old[1].results.map(row => row.genreId), ...genreIds])];
  const affectedSongs = [...new Set([...old[2].results.map(row => row.songId), ...tracks.map(track => track.songId)])];
  const songArtists = affectedSongs.length ? await db.prepare(`SELECT DISTINCT artistId FROM song_artist WHERE songId IN (SELECT value FROM json_each(?))`).bind(jsonParam(affectedSongs)).all<{ artistId: string }>() : { results: [] as { artistId: string }[] };
  const affectedArtists = [...new Set([...old[0].results.map(row => row.artistId), ...artistIds, ...songArtists.results.map(row => row.artistId)])];
  const affectedLabels = [...new Set([current.labelId, input.labelId].filter((value): value is string => !!value))];
  const year = input.year == null ? null : toCeYear(input.year);
  if (year != null && (year < 1950 || year > new Date().getFullYear() + 1)) throw new Error('ปีที่ออกเทปไม่ถูกต้อง');
  const slug = await uniqueSlug(db, 'tape', title, input.slug || undefined, input.id);
  const now = Date.now();
  const publishedAt = input.status === 'published' ? current.publishedAt ?? now : current.publishedAt;
  const names = artistIds.length ? await db.prepare(`SELECT name FROM artist WHERE id IN (${artistIds.map(() => '?').join(',')})`).bind(...artistIds).all<{ name: string }>() : { results: [] as { name: string }[] };
  const labelName = input.labelId ? await db.prepare('SELECT name FROM label WHERE id = ?').bind(input.labelId).first<{ name: string }>() : null;
  const searchText = [title, input.titleAlt, ...names.results.map(row => row.name), labelName?.name, input.catalogNo].filter(Boolean).join(' | ');
  const relationPublished = Number(input.status === 'published');
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE tape SET slug = ?, slugLocked = ?, title = ?, titleAlt = ?, titleSort = ?, labelId = ?, year = ?, yearSort = ?, decade = ?, releaseType = ?, catalogNo = ?, description = ?, reelUrl = ?, isRare = ?, status = ?, publishedAt = ?, coverImageId = ?, coverThumbKey = ?, ogImageKey = ?, updatedBy = ?, updatedAt = ? WHERE id = ?`).bind(slug, Number(!!input.slug), title, input.titleAlt || null, thaiSortKey(title), input.labelId || null, year, yearSortOf(year), decadeOf(year), input.releaseType, input.catalogNo || null, input.description || '', input.reelUrl || null, Number(!!input.isRare), input.status, publishedAt, cover?.id || null, cover?.thumbKey || null, input.ogImageKey ?? current.ogImageKey, userId, now, input.id),
    db.prepare('DELETE FROM tape_artist WHERE tapeId = ?').bind(input.id),
    db.prepare('INSERT INTO tape_artist (tapeId, artistId, position, isPublished, yearSort) SELECT ?, value, CAST(key AS INTEGER), ?, ? FROM json_each(?)').bind(input.id, relationPublished, yearSortOf(year), jsonParam(artistIds)),
    db.prepare('DELETE FROM tape_genre WHERE tapeId = ?').bind(input.id),
    db.prepare('INSERT INTO tape_genre (tapeId, genreId, isPublished, publishedAt) SELECT ?, value, ?, ? FROM json_each(?)').bind(input.id, relationPublished, publishedAt, jsonParam(genreIds)),
    db.prepare('DELETE FROM tape_track WHERE tapeId = ?').bind(input.id),
    db.prepare(`INSERT INTO tape_track (id, tapeId, songId, side, position, durationSec, note)
      SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.songId'), json_extract(value,'$.side'), json_extract(value,'$.position'), json_extract(value,'$.durationSec'), json_extract(value,'$.note') FROM json_each(?)`).bind(input.id, jsonParam(tracks.map(track => ({ ...track, id: crypto.randomUUID() })))),
    db.prepare('UPDATE site_stats SET publishedTapeCount = publishedTapeCount + ?, updatedAt = ? WHERE id = 1').bind(Number(input.status === 'published') - Number(current.status === 'published'), now),
  ];
  if (affectedSongs.length) statements.push(db.prepare(`UPDATE song SET publishedTapeCount = (SELECT COUNT(DISTINCT t.id) FROM tape_track tt JOIN tape t ON t.id = tt.tapeId WHERE tt.songId = song.id AND t.status = 'published') WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(affectedSongs)));
  if (affectedArtists.length) statements.push(db.prepare(`UPDATE artist SET publishedTapeCount = (SELECT COUNT(DISTINCT tapeId) FROM (SELECT ta.tapeId FROM tape_artist ta JOIN tape t ON t.id = ta.tapeId WHERE ta.artistId = artist.id AND t.status = 'published' UNION SELECT tt.tapeId FROM song_artist sa JOIN tape_track tt ON tt.songId = sa.songId JOIN tape t ON t.id = tt.tapeId WHERE sa.artistId = artist.id AND t.status = 'published')) WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(affectedArtists)));
  if (affectedLabels.length) statements.push(db.prepare(`UPDATE label SET publishedTapeCount = (SELECT COUNT(*) FROM tape WHERE labelId = label.id AND status = 'published') WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(affectedLabels)));
  if (affectedGenres.length) statements.push(db.prepare(`UPDATE genre SET publishedTapeCount = (SELECT COUNT(*) FROM tape_genre WHERE genreId = genre.id AND isPublished = 1) WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(affectedGenres)));
  statements.push(...indexStatements(db, 'tape', input.id, title, searchText, input.status === 'published'));
  if (affectedSongs.length) statements.push(db.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM song WHERE id = search_doc.refId) WHERE kind = 'song' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(affectedSongs)));
  if (affectedArtists.length) statements.push(db.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM artist WHERE id = search_doc.refId) WHERE kind = 'artist' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(affectedArtists)));
  if (affectedLabels.length) statements.push(db.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM label WHERE id = search_doc.refId) WHERE kind = 'label' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(affectedLabels)));
  statements.push(...redirectStatements(db, `/tapes/${current.slug}`, `/tapes/${slug}`));
  await db.batch(statements);
  return { id: input.id, slug, status: input.status };
}

export async function saveArtist(db: D1Database, userId: string, input: {
  id: string; name: string; nameAlt?: string | null; slug?: string | null;
  artistType?: 'band' | 'solo' | 'group' | null;
  status?: 'active' | 'inactive' | 'hiatus' | 'deceased' | 'unknown';
  province?: string | null; yearsActive?: string | null; bio?: string;
  imageKey?: string | null;
  members?: { name: string; role?: string; years?: string | null; isCurrent?: boolean }[];
}) {
  const name = requiredName(input.name, 'ชื่อศิลปิน');
  const old = await db.prepare('SELECT slug, name, publishedTapeCount FROM artist WHERE id = ?').bind(input.id).first<{ slug: string; name: string; publishedTapeCount: number }>();
  if (!old) throw new Error('ไม่พบศิลปินนี้');
  const slug = await uniqueSlug(db, 'artist', name, input.slug || undefined, input.id);
  const members = (input.members ?? []).slice(0, 40).map((member, position) => ({ id: crypto.randomUUID(), name: requiredName(member.name, 'ชื่อสมาชิก'), role: member.role || '', years: member.years || null, isCurrent: Number(!!member.isCurrent), position }));
  const now = Date.now();
  await db.batch([
    db.prepare('UPDATE artist SET slug = ?, name = ?, nameAlt = ?, nameSort = ?, artistType = ?, status = ?, province = ?, yearsActive = ?, bio = ?, imageKey = ?, updatedBy = ?, updatedAt = ? WHERE id = ?').bind(slug, name, input.nameAlt || null, thaiSortKey(name), input.artistType || null, input.status || 'unknown', input.province || null, input.yearsActive || null, input.bio || '', input.imageKey || null, userId, now, input.id),
    db.prepare('DELETE FROM artist_member WHERE artistId = ?').bind(input.id),
    db.prepare(`INSERT INTO artist_member (id, artistId, name, role, years, isCurrent, position) SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.name'), json_extract(value,'$.role'), json_extract(value,'$.years'), json_extract(value,'$.isCurrent'), json_extract(value,'$.position') FROM json_each(?)`).bind(input.id, jsonParam(members)),
    ...indexStatements(db, 'artist', input.id, name, [name, input.nameAlt, ...members.map(member => member.name)].filter(Boolean).join(' | '), old.publishedTapeCount > 0),
    ...redirectStatements(db, `/artists/${old.slug}`, `/artists/${slug}`),
  ]);
  if (name !== old.name) await reindexArtistDependents(db, input.id);
  return { id: input.id, slug };
}

export async function saveLabel(db: D1Database, userId: string, input: {
  id: string; name: string; nameAlt?: string | null; slug?: string | null;
  description?: string; logoKey?: string | null;
}) {
  const name = requiredName(input.name, 'ชื่อค่าย');
  const old = await db.prepare('SELECT slug, name, publishedTapeCount FROM label WHERE id = ?').bind(input.id).first<{ slug: string; name: string; publishedTapeCount: number }>();
  if (!old) throw new Error('ไม่พบค่ายนี้');
  const slug = await uniqueSlug(db, 'label', name, input.slug || undefined, input.id);
  await db.batch([
    db.prepare('UPDATE label SET slug = ?, name = ?, nameAlt = ?, nameSort = ?, description = ?, logoKey = ?, updatedBy = ?, updatedAt = ? WHERE id = ?').bind(slug, name, input.nameAlt || null, thaiSortKey(name), input.description || '', input.logoKey || null, userId, Date.now(), input.id),
    ...indexStatements(db, 'label', input.id, name, [name, input.nameAlt].filter(Boolean).join(' | '), old.publishedTapeCount > 0),
    ...redirectStatements(db, `/labels/${old.slug}`, `/labels/${slug}`),
  ]);
  if (name !== old.name) await reindexLabelDependents(db, input.id);
  return { id: input.id, slug };
}

export async function saveSong(db: D1Database, userId: string, input: {
  id: string; title: string; titleAlt?: string | null; slug?: string | null;
  artistIds?: string[]; lyricist?: string | null; composer?: string | null;
  arranger?: string | null; lyrics?: string | null; notes?: string | null;
}) {
  const title = requiredName(input.title, 'ชื่อเพลง');
  const old = await db.prepare('SELECT slug, publishedTapeCount FROM song WHERE id = ?').bind(input.id).first<{ slug: string; publishedTapeCount: number }>();
  if (!old) throw new Error('ไม่พบเพลงนี้');
  const slug = await uniqueSlug(db, 'song', title, input.slug || undefined, input.id);
  const oldArtists = await db.prepare('SELECT artistId FROM song_artist WHERE songId = ?').bind(input.id).all<{ artistId: string }>();
  const artistIds = [...new Set(input.artistIds ?? [])].slice(0, 20);
  const affectedArtists = [...new Set([...oldArtists.results.map(row => row.artistId), ...artistIds])];
  const singers = artistIds.length ? await db.prepare(`SELECT name FROM artist WHERE id IN (${artistIds.map(() => '?').join(',')})`).bind(...artistIds).all<{ name: string }>() : { results: [] as { name: string }[] };
  const statements = [
    db.prepare('UPDATE song SET slug = ?, title = ?, titleAlt = ?, titleSort = ?, lyricist = ?, composer = ?, arranger = ?, lyrics = ?, notes = ?, updatedBy = ?, updatedAt = ? WHERE id = ?').bind(slug, title, input.titleAlt || null, thaiSortKey(title), input.lyricist || null, input.composer || null, input.arranger || null, input.lyrics || null, input.notes || null, userId, Date.now(), input.id),
    db.prepare('DELETE FROM song_artist WHERE songId = ?').bind(input.id),
    db.prepare('INSERT INTO song_artist (songId, artistId, position) SELECT ?, value, CAST(key AS INTEGER) FROM json_each(?)').bind(input.id, jsonParam(artistIds)),
  ];
  if (affectedArtists.length) statements.push(db.prepare(`UPDATE artist SET publishedTapeCount = (SELECT COUNT(DISTINCT tapeId) FROM (SELECT ta.tapeId FROM tape_artist ta JOIN tape t ON t.id = ta.tapeId WHERE ta.artistId = artist.id AND t.status = 'published' UNION SELECT tt.tapeId FROM song_artist sa JOIN tape_track tt ON tt.songId = sa.songId JOIN tape t ON t.id = tt.tapeId WHERE sa.artistId = artist.id AND t.status = 'published')) WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(affectedArtists)));
  statements.push(...indexStatements(db, 'song', input.id, title, [title, input.titleAlt, ...singers.results.map(row => row.name), input.lyricist, input.composer].filter(Boolean).join(' | '), old.publishedTapeCount > 0));
  if (affectedArtists.length) statements.push(db.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM artist WHERE id = search_doc.refId) WHERE kind = 'artist' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(affectedArtists)));
  statements.push(...redirectStatements(db, `/songs/${old.slug}`, `/songs/${slug}`));
  await db.batch(statements);
  return { id: input.id, slug };
}

export async function saveGenre(db: D1Database, input: { id: string; name: string; slug?: string | null; position?: number }) {
  const name = requiredName(input.name, 'ชื่อแนวเพลง');
  const old = await db.prepare('SELECT slug FROM genre WHERE id = ?').bind(input.id).first<{ slug: string }>();
  if (!old) throw new Error('ไม่พบแนวเพลงนี้');
  const slug = await uniqueSlug(db, 'genre', name, input.slug || undefined, input.id);
  await db.batch([
    db.prepare('UPDATE genre SET name = ?, slug = ?, position = COALESCE(?, position) WHERE id = ?').bind(name, slug, input.position ?? null, input.id),
    ...redirectStatements(db, `/genres/${old.slug}`, `/genres/${slug}`),
  ]);
  return { id: input.id, slug };
}

export async function createCollection(db: D1Database, userId: string, titleInput: string) {
  const title = requiredName(titleInput, 'ชื่อ Collection');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, 'collection', title);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO collection (id, slug, title, position, status, createdBy, createdAt, updatedBy, updatedAt) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM collection), 'draft', ?, ?, ?, ?)").bind(id, slug, title, userId, now, userId, now),
    ...indexStatements(db, 'collection', id, title, title, false),
  ]);
  return { id, slug };
}

export async function saveCollection(db: D1Database, userId: string, input: {
  id: string; title: string; slug?: string | null; description?: string;
  coverKey?: string | null; isFeatured?: boolean; status: 'draft' | 'published';
  items?: { tapeId: string; note?: string | null }[];
}) {
  const title = requiredName(input.title, 'ชื่อ Collection');
  const old = await db.prepare('SELECT slug FROM collection WHERE id = ?').bind(input.id).first<{ slug: string }>();
  if (!old) throw new Error('ไม่พบ Collection นี้');
  const slug = await uniqueSlug(db, 'collection', title, input.slug || undefined, input.id);
  const items = (input.items ?? []).slice(0, 100).map((item, position) => ({ tapeId: item.tapeId, note: item.note || null, position }));
  await db.batch([
    db.prepare('UPDATE collection SET slug = ?, title = ?, description = ?, coverKey = ?, isFeatured = ?, status = ?, updatedBy = ?, updatedAt = ? WHERE id = ?').bind(slug, title, input.description || '', input.coverKey || null, Number(!!input.isFeatured), input.status, userId, Date.now(), input.id),
    db.prepare('DELETE FROM collection_item WHERE collectionId = ?').bind(input.id),
    db.prepare(`INSERT INTO collection_item (collectionId, tapeId, position, note) SELECT ?, json_extract(value,'$.tapeId'), json_extract(value,'$.position'), json_extract(value,'$.note') FROM json_each(?)`).bind(input.id, jsonParam(items)),
    ...indexStatements(db, 'collection', input.id, title, title, input.status === 'published'),
    ...redirectStatements(db, `/collections/${old.slug}`, `/collections/${slug}`),
  ]);
  return { id: input.id, slug };
}
