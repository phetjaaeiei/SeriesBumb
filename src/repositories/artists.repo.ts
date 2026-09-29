import type { SqlClient } from '../db/sql-client';
import type { ArtistStatus, ArtistType } from '../domain/enums';

export async function getArtistIdBySlug(sql: SqlClient, slug: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM artist WHERE slug = ?').bind(slug).first<{ id: string }>();
}

/** A random artist with a public song or a published tape (uniform over the visible list), or null when none. */
export async function randomPublicArtist(sql: SqlClient, random = Math.random): Promise<string | null> {
  const visible = `EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1) OR a.publishedTapeCount > 0`;
  const count = await sql.prepare(`SELECT COUNT(*) AS value FROM artist a WHERE ${visible}`).first<{ value: number }>();
  if (!count?.value) return null;
  const offset = Math.min(count.value - 1, Math.max(0, Math.floor(random() * count.value)));
  const row = await sql.prepare(`SELECT a.slug FROM artist a WHERE ${visible} ORDER BY a.nameSort, a.id LIMIT 1 OFFSET ?`).bind(offset).first<{ slug: string }>();
  return row?.slug ?? null;
}

// The /artists listing's visibility filter (unaliased `artist` table): a published tape or a public song.
const visibleArtist = "(publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = artist.id AND s.isPublic = 1))";

/** nameSort of the first visible artist in catalog order, or null when there is none. */
export async function getFirstVisibleArtistNameSort(sql: SqlClient): Promise<{ nameSort: string } | null> {
  return sql.prepare(`SELECT nameSort FROM artist WHERE ${visibleArtist} ORDER BY nameSort, id LIMIT 1`).first<{ nameSort: string }>();
}

export interface ArtistListRow { id: string; slug: string; name: string; artistType: ArtistType | null; status: ArtistStatus; province: string | null; publishedTapeCount: number; nameSort: string }

export interface VisibleArtistFilter {
  /** Takes precedence over `letter`. */
  province: string | null;
  /** A catalog letter (Thai or A–Z) or '0-9'. */
  letter: string | null;
  cursor: { key: string | number; id: string } | null;
}

/** Up to 51 visible artists in (nameSort, id) order after the cursor; one extra row signals a next page. */
export async function listVisibleArtists(sql: SqlClient, filter: VisibleArtistFilter): Promise<ArtistListRow[]> {
  const { province, letter, cursor } = filter;
  const where = [visibleArtist];
  const bindings: (string | number)[] = [];
  if (province) { where.push('province = ?'); bindings.push(province); }
  else if (letter && letter !== '0-9') { where.push('nameSort >= ? AND nameSort < ?'); bindings.push(`${/[A-Z]/u.test(letter) ? '2' : '1'}${letter.toLowerCase()}`, `${/[A-Z]/u.test(letter) ? '2' : '1'}${letter.toLowerCase()}￿`); }
  else if (letter === '0-9') { where.push("nameSort >= '0' AND nameSort < '1'"); }
  if (cursor) { where.push('(nameSort, id) > (?, ?)'); bindings.push(cursor.key, cursor.id); }
  return (await sql.prepare(`SELECT id, slug, name, artistType, status, province, publishedTapeCount, nameSort FROM artist WHERE ${where.join(' AND ')} ORDER BY nameSort, id LIMIT 51`).bind(...bindings).all<ArtistListRow>()).results;
}

export interface ArtistDetail { id: string; slug: string; name: string; nameAlt: string | null; artistType: ArtistType | null; status: ArtistStatus; province: string | null; formedYear: number | null; themes: string | null; yearsActive: string | null; bio: string; imageKey: string | null; publishedTapeCount: number; createdAt: number; updatedAt: number; createdByName: string | null; updatedByName: string | null }

/** An artist by slug with creator/editor names; artists with no published tape or public song only when `admin`. */
export async function getArtistBySlug(sql: SqlClient, slug: string, admin: boolean): Promise<ArtistDetail | null> {
  return sql.prepare(`SELECT a.*, creator.name AS createdByName, editor.name AS updatedByName FROM artist a LEFT JOIN user creator ON creator.id = a.createdBy LEFT JOIN user editor ON editor.id = a.updatedBy WHERE a.slug = ? ${admin ? '' : 'AND (a.publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1))'}`).bind(slug).first<ArtistDetail>();
}

/** Whether the artist sings at least one public song. */
export async function artistHasPublicSong(sql: SqlClient, artistId: string): Promise<boolean> {
  return (await sql.prepare('SELECT 1 AS value FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = ? AND s.isPublic = 1 LIMIT 1').bind(artistId).first<{ value: number }>()) !== null;
}

export interface ArtistMemberRow { name: string; role: string; years: string | null; isCurrent: number; personSlug: string | null }

/** Up to 40 members in position order; personSlug only for sourced person links. */
export async function listArtistMembers(sql: SqlClient, artistId: string): Promise<ArtistMemberRow[]> {
  return (await sql.prepare('SELECT am.name, am.role, am.years, am.isCurrent, p.slug AS personSlug FROM artist_member am LEFT JOIN person p ON p.id = am.personId AND am.sourceId IS NOT NULL WHERE am.artistId = ? ORDER BY am.position LIMIT 40').bind(artistId).all<ArtistMemberRow>()).results;
}

export interface ArtistSongRow { id: string; slug: string; title: string; titleSort: string; firstTapeSlug: string | null; firstTapeTitle: string | null; firstTapeYear: number | null }

/** Up to 101 of the artist's visible songs in (titleSort, id) order after the cursor, each with its earliest published tape. */
export async function listArtistSongs(sql: SqlClient, artistId: string, cursor: { key: string | number; id: string } | null): Promise<ArtistSongRow[]> {
  const songCursorFilter = cursor ? 'AND (s.titleSort, s.id) > (?, ?)' : '';
  return (await sql.prepare(`WITH song_page AS MATERIALIZED (
    SELECT s.id, s.slug, s.title, s.titleSort
    FROM song_artist sa JOIN song s ON s.id = sa.songId
    WHERE sa.artistId = ? AND (s.isPublic = 1 OR s.publishedTapeCount > 0) ${songCursorFilter}
    ORDER BY s.titleSort, s.id LIMIT 101
  )
  SELECT sp.id, sp.slug, sp.title, sp.titleSort,
    firstTape.slug AS firstTapeSlug, firstTape.title AS firstTapeTitle, firstTape.year AS firstTapeYear
  FROM song_page sp
  LEFT JOIN tape firstTape ON firstTape.id = (
    SELECT t.id FROM tape_track tt JOIN tape t ON t.id = tt.tapeId
    WHERE tt.songId = sp.id AND t.status = 'published'
    ORDER BY t.yearSort, t.id LIMIT 1
  )
  ORDER BY sp.titleSort, sp.id`).bind(artistId, ...(cursor ? [cursor.key, cursor.id] : [])).all<ArtistSongRow>()).results;
}

/** The three most common published genres across the artist's first 200 published tapes. */
export async function listArtistTopGenres(sql: SqlClient, artistId: string): Promise<{ name: string }[]> {
  return (await sql.prepare(`SELECT g.name FROM (
    SELECT ta.tapeId FROM tape_artist ta JOIN tape t ON t.id = ta.tapeId
    WHERE ta.artistId = ? AND ta.isPublished = 1 AND t.status = 'published'
    ORDER BY ta.yearSort, ta.tapeId LIMIT 200
  ) artistTapes JOIN tape_genre tg ON tg.tapeId = artistTapes.tapeId AND tg.isPublished = 1
    JOIN genre g ON g.id = tg.genreId
    GROUP BY g.id ORDER BY COUNT(*) DESC, g.name LIMIT 3`).bind(artistId).all<{ name: string }>()).results;
}

/** The label of the artist's latest published tape (dated tapes first), or null. */
export async function getArtistLastLabel(sql: SqlClient, artistId: string): Promise<{ name: string; slug: string } | null> {
  return sql.prepare(`SELECT l.name, l.slug FROM tape_artist ta JOIN tape t ON t.id = ta.tapeId JOIN label l ON l.id = t.labelId
    WHERE ta.artistId = ? AND ta.isPublished = 1 AND t.status = 'published'
    ORDER BY (t.year IS NULL), t.yearSort DESC, t.publishedAt DESC, t.id DESC LIMIT 1`).bind(artistId).first<{ name: string; slug: string }>();
}

export interface ArtistAppearanceRow { slug: string; title: string; year: number | null; songSlug: string; songTitle: string }

/** The artist's songs on published compilations/soundtracks not credited to the artist (at most 80). */
export async function listArtistCompilationAppearances(sql: SqlClient, artistId: string): Promise<ArtistAppearanceRow[]> {
  return (await sql.prepare(`SELECT DISTINCT t.slug, t.title, t.year, s.slug AS songSlug, s.title AS songTitle
    FROM song_artist sa JOIN song s ON s.id = sa.songId
    JOIN tape_track tt ON tt.songId = s.id JOIN tape t ON t.id = tt.tapeId
    WHERE sa.artistId = ? AND t.status = 'published' AND t.releaseType IN ('compilation', 'soundtrack')
      AND NOT EXISTS (SELECT 1 FROM tape_artist ta WHERE ta.tapeId = t.id AND ta.artistId = ?)
    ORDER BY t.yearSort, t.title, s.title LIMIT 80`).bind(artistId, artistId).all<ArtistAppearanceRow>()).results;
}

export interface SimilarArtistRow { name: string; slug: string; sharedGenres: number }

/** Up to 12 other artists ranked by how many published genres their published tapes share with this artist's. */
export async function listSimilarArtistsByGenre(sql: SqlClient, artistId: string): Promise<SimilarArtistRow[]> {
  return (await sql.prepare(`SELECT other.name, other.slug, COUNT(DISTINCT tg.genreId) AS sharedGenres
    FROM tape_artist mine JOIN tape_genre tg ON tg.tapeId = mine.tapeId AND tg.isPublished = 1
    JOIN tape_genre otherGenre ON otherGenre.genreId = tg.genreId AND otherGenre.isPublished = 1
    JOIN tape_artist otherTape ON otherTape.tapeId = otherGenre.tapeId AND otherTape.isPublished = 1
    JOIN artist other ON other.id = otherTape.artistId
    WHERE mine.artistId = ? AND mine.isPublished = 1 AND other.id != ?
    GROUP BY other.id ORDER BY sharedGenres DESC, other.nameSort LIMIT 12`).bind(artistId, artistId).all<SimilarArtistRow>()).results;
}

export interface ArtistReelLinkRow { title: string; slug: string; reelUrl: string }

/** Review reel links of the artist's published tapes, oldest first (at most 30). */
export async function listArtistReelLinks(sql: SqlClient, artistId: string): Promise<ArtistReelLinkRow[]> {
  return (await sql.prepare(`SELECT t.title, t.slug, t.reelUrl FROM tape_artist ta JOIN tape t ON t.id = ta.tapeId
    WHERE ta.artistId = ? AND ta.isPublished = 1 AND t.status = 'published' AND t.reelUrl IS NOT NULL
    ORDER BY t.yearSort, t.title LIMIT 30`).bind(artistId).all<ArtistReelLinkRow>()).results;
}

/** The first 100 artists with a public song by name, for the advanced search filter. */
export async function listArtistFilterOptions(sql: SqlClient): Promise<{ slug: string; name: string }[]> {
  return (await sql.prepare('SELECT a.slug, a.name FROM artist a WHERE EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1) ORDER BY a.nameSort LIMIT 100').all<{ slug: string; name: string }>()).results;
}
