// Synthetic catalog built through the real services, so every counter, slug and search row is
// what the app itself would write. Used by the HTML parity harness and by query budget tests.
import { addArtistRelation, addTapeEdition } from '../../src/services/catalog-relations';
import { addCatalogSource } from '../../src/services/catalog-sources';
import { createArtist, createCollection, createGenre, createLabel, createSong, createTapeDraft, saveArtist, saveCollection, saveLabel, saveSong, saveTape } from '../../src/services/catalog';
import { createComment } from '../../src/services/comments';
import { setEngagement } from '../../src/services/engagement';
import { createPerson, linkArtistMember } from '../../src/services/people';
import { addPersonCredit } from '../../src/services/person-credits';
import { moderateReview, submitCorrection, submitReview } from '../../src/services/reviews';
import { continueReindex } from '../../src/services/search-admin';

export interface SeedSize { artists: number; labels: number; genres: number; songs: number; tapes: number; collections: number; members: number }

export const SEED_SIZES = {
  parity: { artists: 24, labels: 6, genres: 6, songs: 90, tapes: 36, collections: 4, members: 4 },
  budget: { artists: 400, labels: 40, genres: 16, songs: 3000, tapes: 1000, collections: 20, members: 30 },
} satisfies Record<string, SeedSize>;

export interface SeededUser { id: string; email: string; role: 'admin' | 'member' }
export interface SeedResult { admin: SeededUser; members: SeededUser[]; tapeIds: string[]; artistIds: string[]; songIds: string[] }

const ARTIST_WORDS = ['คาราบาว', 'แกรนด์เอ็กซ์', 'ดิ อิมพอสซิเบิ้ล', 'ชาตรี', 'ฟรุ้ตตี้', 'พลอย', 'แร็พเตอร์', 'Micro', 'Nuvo', 'Asanee'];
const TITLE_WORDS = ['รักเธอ', 'ทะเล', 'ฝน', 'เมือง', 'คืนนี้', 'Summer', 'Memories', 'หัวใจ', 'บ้าน', 'ดาว'];
const word = (list: string[], index: number) => list[index % list.length];

async function insertUser(db: D1Database, user: SeededUser, name: string, now: number) {
  await db.prepare('INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?, ?)')
    .bind(user.id, name, user.email, user.role, now, now).run();
  await db.prepare('UPDATE site_stats SET userCount = userCount + 1 WHERE id = 1').run();
}

/** Builds a deterministic-shaped catalog (ids and timestamps vary per run, counts and names do not). */
export async function seedCatalog(db: D1Database, size: SeedSize, now = Date.now()): Promise<SeedResult> {
  const admin: SeededUser = { id: crypto.randomUUID(), email: 'owner@parity.test', role: 'admin' };
  await insertUser(db, admin, 'เจ้าของคลัง', now);
  const members: SeededUser[] = [];
  for (let i = 0; i < size.members; i += 1) {
    const member: SeededUser = { id: crypto.randomUUID(), email: `member${i}@parity.test`, role: 'member' };
    await insertUser(db, member, `สมาชิก ${i + 1}`, now);
    members.push(member);
  }

  const labels: { id: string }[] = [];
  for (let i = 0; i < size.labels; i += 1) {
    const label = await createLabel(db, admin.id, `ค่ายเพลง ${word(TITLE_WORDS, i)} ${i + 1}`);
    await saveLabel(db, admin.id, { id: label.id, name: `ค่ายเพลง ${word(TITLE_WORDS, i)} ${i + 1}`, description: `ค่ายที่ ${i + 1} ของชุดทดสอบ` });
    labels.push(label);
  }
  const genres: { id: string }[] = [];
  for (let i = 0; i < size.genres; i += 1) genres.push(await createGenre(db, `แนวเพลง ${i + 1}`));

  const artists: { id: string }[] = [];
  for (let i = 0; i < size.artists; i += 1) {
    const name = `${word(ARTIST_WORDS, i)} ${i + 1}`;
    const artist = await createArtist(db, admin.id, name);
    await saveArtist(db, admin.id, {
      id: artist.id, name, bio: `ประวัติของ ${name}`, formedYear: 1980 + (i % 30), artistType: i % 3 === 0 ? 'band' : 'solo',
      members: i % 3 === 0 ? [{ name: `สมาชิกวง ${i + 1}`, role: 'ร้องนำ', isCurrent: true }] : [],
    });
    artists.push(artist);
  }

  const songs: { id: string }[] = [];
  for (let i = 0; i < size.songs; i += 1) {
    const song = await createSong(db, admin.id, { title: `${word(TITLE_WORDS, i)} ${i + 1}`, artistIds: [artists[i % artists.length].id] });
    if (i % 10 === 0) await saveSong(db, admin.id, { id: song.id, title: `${word(TITLE_WORDS, i)} ${i + 1}`, artistIds: [artists[i % artists.length].id], lyrics: `เนื้อเพลงบรรทัดแรก\nบรรทัดที่สอง ${i}`, composer: 'ผู้แต่งทดสอบ' });
    songs.push(song);
  }

  const tapes: { id: string }[] = [];
  for (let i = 0; i < size.tapes; i += 1) {
    const title = `อัลบั้ม ${word(TITLE_WORDS, i)} ${i + 1}`;
    const tape = await createTapeDraft(db, admin.id, title);
    const published = i % 6 !== 5;
    if (published) {
      await db.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', ?, ?, 1200, 1200, 100, 0)")
        .bind(crypto.randomUUID(), tape.id, `tapes/${tape.id}/front-full.webp`, `tapes/${tape.id}/front-thumb.webp`).run();
    }
    const trackSongs = [0, 1, 2, 3].map((n) => songs[(i * 2 + n) % songs.length]);
    await saveTape(db, admin.id, {
      id: tape.id, title, releaseType: i % 4 === 0 ? 'compilation' : 'album', year: 2530 + (i % 25), catalogNo: `PAR-${String(i + 1).padStart(4, '0')}`,
      description: `รายละเอียดของ ${title}`, isRare: i % 7 === 0,
      labelId: labels[i % labels.length]?.id ?? null, artistIds: [artists[i % artists.length].id], genreIds: [genres[i % genres.length].id],
      tracks: trackSongs.map((song, n) => ({ songId: song.id, side: n < 2 ? 'A' : 'B', position: (n % 2) + 1, durationSec: 180 + n * 7 })),
      status: published ? 'published' : 'draft',
    });
    tapes.push(tape);
  }

  for (let i = 0; i < size.collections; i += 1) {
    const collection = await createCollection(db, admin.id, `รวมเทปชุดที่ ${i + 1}`);
    await saveCollection(db, admin.id, {
      id: collection.id, title: `รวมเทปชุดที่ ${i + 1}`, status: 'published', isFeatured: i < 2, description: `คอลเลกชันทดสอบ ${i + 1}`,
      items: tapes.filter((_, n) => n % 6 !== 5).slice(i * 3, i * 3 + 5).map((tape) => ({ tapeId: tape.id, note: null })),
    });
  }

  // People, credits, relations and sources reference published records.
  const artistSource = await addCatalogSource(db, admin.id, { entityKind: 'artist', entityId: artists[0].id, title: 'แหล่งอ้างอิงศิลปิน', url: 'https://example.com/artist-source', claim: 'ข้อมูลจากปกเทป', accessedAt: now });
  const tapeSource = await addCatalogSource(db, admin.id, { entityKind: 'tape', entityId: tapes[0].id, title: 'แหล่งอ้างอิงเทป', url: 'https://example.com/tape-source', claim: 'เครดิตบนปกใน', accessedAt: now });
  const person = await createPerson(db, 'บุคคลทดสอบ');
  const member = await db.prepare('SELECT id FROM artist_member WHERE artistId = ? LIMIT 1').bind(artists[0].id).first<{ id: string }>();
  if (member) await linkArtistMember(db, member.id, person.id, artistSource.id);
  await addPersonCredit(db, { personId: person.id, targetKind: 'tape', targetId: tapes[0].id, creditedAs: 'บุคคลทดสอบ', role: 'โปรดิวเซอร์', sourceId: tapeSource.id });
  if (artists.length > 1) await addArtistRelation(db, artists[0].id, artists[1].id, 'related', artistSource.id);
  if (tapes.length > 1) await addTapeEdition(db, tapes[0].id, tapes[1].id, 'cd', 2545, 'ฉบับซีดี', tapeSource.id);

  // Community: likes, ownership, comments, reviews (one published) and a pending correction.
  for (const [n, user] of members.entries()) {
    await setEngagement(db, user.id, 'tapeLike', tapes[n % tapes.length].id, true);
    await setEngagement(db, user.id, 'tapeOwned', tapes[(n + 1) % tapes.length].id, true);
    await setEngagement(db, user.id, 'songLike', songs[n % songs.length].id, true);
    await createComment(db, user.id, 'member', { tapeId: tapes[0].id }, `คอมเมนต์ทดสอบจากสมาชิก ${n + 1}`);
  }
  if (members[0]) {
    const review = await submitReview(db, members[0].id, tapes[0].id, 5, 'รีวิวทดสอบ เทปม้วนนี้เสียงดีมาก ปกยังสวย เพลงหน้า A ฟังเพลินตั้งแต่ต้นจนจบ เก็บไว้ฟังได้อีกนาน แนะนำให้หามาฟังกันครับ');
    await moderateReview(db, admin.id, review.id, 'published');
    await submitCorrection(db, members[0].id, 'tape', tapes[0].id, 'ปีที่ออกน่าจะเป็น 2531', 'https://example.com/proof');
  }
  while ((await continueReindex(db)).remaining > 0) { /* drain the search queue */ }

  return { admin, members, tapeIds: tapes.map((tape) => tape.id), artistIds: artists.map((artist) => artist.id), songIds: songs.map((song) => song.id) };
}
