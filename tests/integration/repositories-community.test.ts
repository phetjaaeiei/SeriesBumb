// The repository functions behind the community, people, credit, relation, source, audit and audio
// services, run against the parity seed: reads return the rows the services and loaders start from
// (or null for a missing record), and the guarded writes report what they changed.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import { getRecordId } from '../../src/repositories/admin.repo';
import { getArtistMemberArtist } from '../../src/repositories/artists.repo';
import {
  deleteDeletingAudio, getAudioFileRow, getAudioUsageRows, insertAudioReservation, listAudioFiles, lockAudioForDelete,
} from '../../src/repositories/audio.repo';
import { insertAuditLog, listAudit } from '../../src/repositories/audit.repo';
import {
  getCommentForModeration, getCommentRow, getOwnLiveCommentTarget, getVisibleCommentTarget, getVisibleEngagementTarget, getVisibleTargetId,
  insertCommentIfAllowed, listCommentRows, setPendingCorrectionStatus, setPendingReviewStatus,
} from '../../src/repositories/community.repo';
import { countPersonCredits, creditsForTarget, publicCreditsForPerson } from '../../src/repositories/credits.repo';
import { getPersonIdBySlug } from '../../src/repositories/people.repo';
import { countTapeEditions, publicArtistRelations, publicTapeEditions } from '../../src/repositories/relations.repo';
import { getArtistCatalogSourceId, getCatalogSourceIdFor, listCatalogSources } from '../../src/repositories/sources.repo';
import { getUserCommentBanned, getUserForRoleChange, getUserRole } from '../../src/repositories/users.repo';
import { loadPersonDetail } from '../../src/loaders/person-detail';
import { loadSongDetail } from '../../src/loaders/song-detail';
import { loadTapeDetail } from '../../src/loaders/tape-detail';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;
const missingId = () => crypto.randomUUID();

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('community, people and archive repositories', () => {
  it('reads catalog sources and checks which record a source belongs to', async () => {
    const [tapeId] = seeded.tapeIds;
    const [artistId] = seeded.artistIds;
    const [source] = await listCatalogSources(env.DB, 'tape', tapeId);
    expect(source).toMatchObject({ entityKind: 'tape', entityId: tapeId, title: 'แหล่งอ้างอิงเทป', url: 'https://example.com/tape-source', claim: 'เครดิตบนปกใน' });
    expect(await getCatalogSourceIdFor(env.DB, source.id, 'tape', tapeId)).toEqual({ id: source.id });
    expect(await getCatalogSourceIdFor(env.DB, source.id, 'artist', tapeId)).toBeNull();
    const [artistSource] = await listCatalogSources(env.DB, 'artist', artistId);
    expect(await getArtistCatalogSourceId(env.DB, artistSource.id, artistId)).toEqual({ id: artistSource.id });
    expect(await getArtistCatalogSourceId(env.DB, source.id, artistId)).toBeNull();
    expect(await listCatalogSources(env.DB, 'song', missingId())).toEqual([]);
  });

  it('checks that records exist before write paths link to them', async () => {
    expect(await getRecordId(env.DB, 'tape', seeded.tapeIds[0])).toEqual({ id: seeded.tapeIds[0] });
    expect(await getRecordId(env.DB, 'song', seeded.songIds[0])).toEqual({ id: seeded.songIds[0] });
    expect(await getRecordId(env.DB, 'artist', seeded.artistIds[0])).toEqual({ id: seeded.artistIds[0] });
    expect(await getRecordId(env.DB, 'artist', seeded.tapeIds[0])).toBeNull();
    expect(await getRecordId(env.DB, 'person', missingId())).toBeNull();
  });

  it('reads public relations, editions and person credits', async () => {
    const [tapeId, secondTapeId] = seeded.tapeIds;
    const [artistId, secondArtistId] = seeded.artistIds;
    const relatedArtist = await one<{ slug: string; name: string }>('SELECT slug, name FROM artist WHERE id = ?', secondArtistId);
    expect(await publicArtistRelations(env.DB, artistId)).toEqual([{ relationType: 'related', slug: relatedArtist.slug, name: relatedArtist.name, sourceTitle: 'แหล่งอ้างอิงศิลปิน', sourceUrl: 'https://example.com/artist-source' }]);
    const edition = await one<{ slug: string; title: string }>('SELECT slug, title FROM tape WHERE id = ?', secondTapeId);
    expect(await publicTapeEditions(env.DB, tapeId)).toEqual([{ format: 'cd', editionYear: 2545, note: 'ฉบับซีดี', slug: edition.slug, title: edition.title, sourceTitle: 'แหล่งอ้างอิงเทป', sourceUrl: 'https://example.com/tape-source' }]);
    expect(await countTapeEditions(env.DB, tapeId)).toEqual({ value: 1 });

    const [credit] = await creditsForTarget(env.DB, 'tape', tapeId);
    expect(credit).toMatchObject({ creditedAs: 'บุคคลทดสอบ', role: 'โปรดิวเซอร์', personName: 'บุคคลทดสอบ', sourceTitle: 'แหล่งอ้างอิงเทป' });
    expect(await countPersonCredits(env.DB, 'tape', tapeId)).toEqual({ value: 1 });
    const person = await getPersonIdBySlug(env.DB, credit.personSlug);
    expect(person).toEqual({ id: expect.any(String) });
    const tape = await one<{ slug: string; title: string }>('SELECT slug, title FROM tape WHERE id = ?', tapeId);
    expect(await publicCreditsForPerson(env.DB, person!.id)).toEqual([expect.objectContaining({ targetKind: 'tape', tapeSlug: tape.slug, tapeTitle: tape.title, songSlug: null })]);

    const missing = missingId();
    expect(await publicArtistRelations(env.DB, missing)).toEqual([]);
    expect(await publicTapeEditions(env.DB, missing)).toEqual([]);
    expect(await creditsForTarget(env.DB, 'song', missing)).toEqual([]);
    expect(await getPersonIdBySlug(env.DB, 'no-such-person')).toBeNull();
  });

  it('reads band members and users for the admin write paths', async () => {
    const member = await one<{ id: string }>('SELECT id FROM artist_member WHERE artistId = ? LIMIT 1', seeded.artistIds[0]);
    expect(await getArtistMemberArtist(env.DB, member.id)).toEqual({ id: member.id, artistId: seeded.artistIds[0] });
    expect(await getArtistMemberArtist(env.DB, missingId())).toBeNull();

    const [firstMember] = seeded.members;
    expect(await getUserCommentBanned(env.DB, firstMember.id)).toEqual({ commentBanned: 0 });
    expect(await getUserForRoleChange(env.DB, seeded.admin.id)).toEqual({ id: seeded.admin.id, email: seeded.admin.email, role: 'admin' });
    expect(await getUserRole(env.DB, firstMember.id)).toEqual({ id: firstMember.id, role: 'member' });
    expect(await getUserCommentBanned(env.DB, missingId())).toBeNull();
    expect(await getUserRole(env.DB, missingId())).toBeNull();
  });

  it('reads visible targets and pages comments', async () => {
    const [tapeId] = seeded.tapeIds;
    const draftId = seeded.tapeIds[5];
    expect(await getVisibleTargetId(env.DB, 'tape', tapeId)).toEqual({ id: tapeId });
    expect(await getVisibleTargetId(env.DB, 'tape', draftId)).toBeNull();
    expect(await getVisibleTargetId(env.DB, 'song', seeded.songIds[0])).toEqual({ id: seeded.songIds[0] });
    expect(await getVisibleCommentTarget(env.DB, { tapeId })).toEqual({ id: tapeId });
    expect(await getVisibleCommentTarget(env.DB, { songId: missingId() })).toBeNull();
    expect(await getVisibleEngagementTarget(env.DB, 'songLike', seeded.songIds[0])).toEqual({ id: seeded.songIds[0] });
    expect(await getVisibleEngagementTarget(env.DB, 'tapeOwned', draftId)).toBeNull();

    const rows = await listCommentRows(env.DB, { tapeId }, null);
    expect(rows).toHaveLength(seeded.members.length);
    expect(rows.map(row => row.body)).toContain('คอมเมนต์ทดสอบจากสมาชิก 1');
    const [newest, next] = rows;
    expect(await listCommentRows(env.DB, { tapeId }, { key: newest.createdAt, id: newest.id })).toEqual(rows.slice(1));
    expect(await getCommentRow(env.DB, next.id)).toEqual(next);
    expect(await getOwnLiveCommentTarget(env.DB, next.id, next.userId)).toEqual({ tapeId, songId: null });
    expect(await getOwnLiveCommentTarget(env.DB, next.id, seeded.admin.id)).toBeNull();
    expect(await getCommentForModeration(env.DB, next.id)).toEqual({ id: next.id, tapeId, songId: null, deletedAt: null, deletedByAdmin: 0 });
    expect(await getCommentRow(env.DB, missingId())).toBeNull();
    expect(await listCommentRows(env.DB, { songId: seeded.songIds[0] }, null)).toEqual([]);
  });

  it('refuses guarded community writes without changing rows', async () => {
    const now = Date.now();
    const draft = { id: crypto.randomUUID(), userId: seeded.members[0].id, target: { tapeId: seeded.tapeIds[5] }, body: 'ไม่ควรบันทึก', now };
    expect(await insertCommentIfAllowed(env.DB, draft, { minuteSince: now - 60_000, daySince: now - 86_400_000 })).toBe(0);
    expect(await setPendingReviewStatus(env.DB, missingId(), 'published', seeded.admin.id, now)).toBe(0);
    const correction = await one<{ id: string }>("SELECT id FROM catalog_submission WHERE status = 'pending' LIMIT 1");
    expect(await setPendingCorrectionStatus(env.DB, correction.id, 'rejected', seeded.admin.id, now)).toBe(1);
    expect(await setPendingCorrectionStatus(env.DB, correction.id, 'accepted', seeded.admin.id, now)).toBe(0);
  });

  it('pages the audit log', async () => {
    const now = Date.now();
    const entry = { actorUserId: seeded.admin.id, actorEmail: seeded.admin.email, targetId: null, status: 200 };
    await insertAuditLog(env.DB, crypto.randomUUID(), { ...entry, action: 'admin.repo.first' }, now + 10_000);
    await insertAuditLog(env.DB, crypto.randomUUID(), { ...entry, action: 'admin.repo.second' }, now + 20_000);
    const first = await listAudit(env.DB, null, 1);
    expect(first.rows).toEqual([expect.objectContaining({ action: 'admin.repo.second', actorEmail: seeded.admin.email, status: 200 })]);
    expect(first.next).not.toBeNull();
    const second = await listAudit(env.DB, first.next, 1);
    expect(second.rows[0].action).toBe('admin.repo.first');
  });

  it('reserves, lists and removes an audio file', async () => {
    const usage = await getAudioUsageRows(env.DB, '2000-01-01');
    expect(usage).toEqual({ totals: [], downloads: [], imageBytes: expect.any(Number) });
    expect(await listAudioFiles(env.DB, null, null)).toEqual([]);

    const id = crypto.randomUUID();
    const now = Date.now();
    const file = await insertAudioReservation(env.DB, {
      id, title: 'เทปต้นฉบับ', filename: 'master.wav', provider: 'drive', size: 0, contentType: 'application/octet-stream', objectKey: null,
      driveUrl: 'https://drive.google.com/file/d/abcdefghijk/view', note: null, songId: null, tapeId: seeded.tapeIds[0], status: 'ready', createdBy: seeded.admin.id, now,
    }, 10_000, null);
    expect(file).toMatchObject({ id, title: 'เทปต้นฉบับ', provider: 'drive', status: 'ready', tapeId: seeded.tapeIds[0] });
    expect(await listAudioFiles(env.DB, '%ต้นฉบับ%', null)).toEqual([file]);
    expect(await listAudioFiles(env.DB, '%none%', null)).toEqual([]);
    expect(await listAudioFiles(env.DB, null, [now, id])).toEqual([]);
    expect(await getAudioFileRow(env.DB, id)).toMatchObject({ id, objectKey: null, signedAt: null, updatedAt: now });

    expect(await lockAudioForDelete(env.DB, id, now, now, now)).toEqual({ id });
    await deleteDeletingAudio(env.DB, id);
    expect(await getAudioFileRow(env.DB, id)).toBeNull();
  });

  it('loads tape, song and person pages from these repositories, and null when missing', async () => {
    const tape = await one<{ slug: string }>('SELECT slug FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const tapeModel = await loadTapeDetail(env.DB, tape.slug, null);
    expect(tapeModel).not.toBeNull();
    expect(tapeModel!.catalogSources).toHaveLength(1);
    expect(tapeModel!.credits).toHaveLength(1);
    expect(tapeModel!.editions).toHaveLength(1);
    expect(tapeModel!.firstComments!.items).toHaveLength(seeded.members.length);

    const song = await one<{ slug: string }>('SELECT slug FROM song WHERE id = ?', seeded.songIds[0]);
    const songModel = await loadSongDetail(env.DB, song.slug, null);
    expect(songModel).toMatchObject({ publicSong: true, catalogSources: [], credits: [] });
    expect(songModel!.firstComments).toEqual({ items: [], nextCursor: null });

    const [credit] = await creditsForTarget(env.DB, 'tape', seeded.tapeIds[0]);
    const personModel = await loadPersonDetail(env.DB, credit.personSlug, null);
    expect(personModel!.person.name).toBe('บุคคลทดสอบ');
    expect(personModel!.credits).toHaveLength(1);

    expect(await loadTapeDetail(env.DB, 'no-such-tape', null)).toBeNull();
    expect(await loadSongDetail(env.DB, 'no-such-song', null)).toBeNull();
    expect(await loadPersonDetail(env.DB, 'no-such-person', null)).toBeNull();
  });
});
