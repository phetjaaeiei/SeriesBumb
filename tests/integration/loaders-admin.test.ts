import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import type { SqlClient } from '../../src/db/sql-client';
import { loadAdminAudit } from '../../src/loaders/admin/audit';
import { loadAdminCatalog } from '../../src/loaders/admin/catalog';
import { loadAdminComments } from '../../src/loaders/admin/comments';
import { loadAdminCredits } from '../../src/loaders/admin/credits';
import { loadAdminDashboard } from '../../src/loaders/admin/dashboard';
import { loadAdminEditor } from '../../src/loaders/admin/editor';
import { loadAdminPeople } from '../../src/loaders/admin/people';
import { loadAdminReadiness } from '../../src/loaders/admin/readiness';
import { loadAdminRelations } from '../../src/loaders/admin/relations';
import { loadAdminReviews } from '../../src/loaders/admin/reviews';
import { loadAdminSources } from '../../src/loaders/admin/sources';
import { loadAdminTapeImage } from '../../src/loaders/admin/tape-image';
import { loadAdminUsers } from '../../src/loaders/admin/users';
import { lookupAdminChoices } from '../../src/repositories/admin.repo';
import { getRedirectTarget } from '../../src/repositories/redirects.repo';
import { deleteSession } from '../../src/repositories/sessions.repo';
import { getSessionUserRow } from '../../src/repositories/users.repo';
import { recordAudit } from '../../src/services/audit';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;
const params = (values: Record<string, string> = {}) => new URLSearchParams(values);
const missingId = () => crypto.randomUUID();

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('admin loaders', () => {
  it('loads the dashboard counters, newest comments and oldest drafts', async () => {
    const model = await loadAdminDashboard(env.DB);
    expect(model.loadError).toBe(false);
    expect(model.stats).toMatchObject({ songCount: SEED_SIZES.parity.songs, userCount: SEED_SIZES.parity.members + 1, reindexCursor: null });
    expect(model.stats!.publishedTapeCount).toBeGreaterThanOrEqual(30);
    expect(model.pendingReindex).toBe(0);
    expect(model.recentComments).toHaveLength(SEED_SIZES.parity.members);
    expect(model.recentComments[0]).toMatchObject({ deletedAt: null, songSlug: null });
    expect(model.draftTapes).toHaveLength(6);
    for (const draft of model.draftTapes) expect(await one<{ status: string }>('SELECT status FROM tape WHERE id = ?', draft.id)).toEqual({ status: 'draft' });

    const broken = { prepare() { throw new Error('D1 down'); } } as unknown as SqlClient;
    expect(await loadAdminDashboard(broken)).toEqual({ stats: null, dbBytes: null, pendingReindex: 0, recentComments: [], draftTapes: [], loadError: true });
  });

  it('pages an admin catalog list with its filters, and null for an unknown kind', async () => {
    const model = await loadAdminCatalog(env.DB, 'tapes', params({ q: '  ', status: 'bogus' }));
    expect(model).toMatchObject({ kind: 'tapes', query: '', status: 'all', unlinked: false, nextCursor: null });
    expect(model!.items).toHaveLength(SEED_SIZES.parity.tapes);

    const drafts = await loadAdminCatalog(env.DB, 'tapes', params({ status: 'draft' }));
    expect(drafts!.items).toHaveLength(6);
    expect(drafts!.items.every(row => row.status === 'draft')).toBe(true);
    expect((await loadAdminCatalog(env.DB, 'genres', params()))!.items).toHaveLength(SEED_SIZES.parity.genres);

    expect(await loadAdminCatalog(env.DB, 'users', params())).toBeNull();
    expect(await loadAdminCatalog(env.DB, undefined, params())).toBeNull();
  });

  it('loads a record with what its editor edits, and null for an unknown kind or record', async () => {
    const tapeId = seeded.tapeIds[0];
    const tape = await loadAdminEditor(env.DB, 'tapes', tapeId);
    expect(tape).not.toBeNull();
    expect(tape!.kind).toBe('tapes');
    expect(tape!.record).toMatchObject({ id: tapeId, status: 'published' });
    expect(tape!.artistIds).toEqual([seeded.artistIds[0]]);
    expect(tape!.genreIds).toHaveLength(1);
    expect(tape!.tracks.map(track => `${track.side}${track.position}`)).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(tape!.images).toHaveLength(1);
    expect(tape!.members).toEqual([]);
    expect(tape!.items).toEqual([]);
    const choiceIds = tape!.selected.map(choice => choice.id);
    expect(choiceIds).toEqual(expect.arrayContaining([seeded.artistIds[0], ...tape!.genreIds, String(tape!.record.labelId), ...tape!.tracks.map(track => track.songId)]));

    const song = await loadAdminEditor(env.DB, 'songs', seeded.songIds[0]);
    expect(song).toMatchObject({ kind: 'songs', artistIds: [seeded.artistIds[0]], genreIds: [], tracks: [], images: [] });
    expect(song!.selected).toMatchObject([{ id: seeded.artistIds[0] }]);

    const band = await loadAdminEditor(env.DB, 'artists', seeded.artistIds[0]);
    expect(band!.members).toMatchObject([{ name: 'สมาชิกวง 1', role: 'ร้องนำ', isCurrent: 1 }]);
    expect(band!.selected).toEqual([]);

    const collection = await one<{ id: string }>('SELECT id FROM collection ORDER BY position LIMIT 1');
    const collectionModel = await loadAdminEditor(env.DB, 'collections', collection.id);
    expect(collectionModel!.items.length).toBeGreaterThan(0);
    expect(collectionModel!.selected.map(choice => choice.id)).toEqual(expect.arrayContaining(collectionModel!.items.map(item => item.tapeId)));

    expect(await loadAdminEditor(env.DB, 'tapes', missingId())).toBeNull();
    expect(await loadAdminEditor(env.DB, 'users', tapeId)).toBeNull();
    expect(await loadAdminEditor(env.DB, 'tapes', undefined)).toBeNull();
  });

  it('lists users with bootstrap and self flags, filtered by name or email', async () => {
    const bootstrap = new Set([seeded.admin.email]);
    const model = await loadAdminUsers(env.DB, params(), seeded.admin, bootstrap);
    expect(model).toMatchObject({ query: '', next: null, canManageRoles: true });
    expect(model.rows).toHaveLength(SEED_SIZES.parity.members + 1);
    expect(model.rows.find(row => row.id === seeded.admin.id)).toMatchObject({ role: 'admin', protectedAdmin: true, self: true });
    expect(model.rows.filter(row => row.self)).toHaveLength(1);

    const filtered = await loadAdminUsers(env.DB, params({ q: ` ${seeded.members[0].email} ` }), seeded.members[1], bootstrap);
    expect(filtered).toMatchObject({ query: seeded.members[0].email, canManageRoles: false });
    expect(filtered.rows).toMatchObject([{ id: seeded.members[0].id, protectedAdmin: false, self: false }]);
    expect((await loadAdminUsers(env.DB, params({ q: 'nobody-here@example.test' }), null, new Set())).rows).toEqual([]);
  });

  it('lists comments with their targets, filtered by kind', async () => {
    const tape = await one<{ slug: string; title: string }>('SELECT slug, title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const model = await loadAdminComments(env.DB, params({ kind: 'nope' }));
    expect(model).toMatchObject({ kind: 'all', next: null });
    expect(model.rows).toHaveLength(SEED_SIZES.parity.members);
    expect(model.rows[0]).toMatchObject({ deletedAt: null, canRestore: false, targetTitle: tape.title, targetUrl: `/tapes/${encodeURIComponent(tape.slug)}` });
    expect((await loadAdminComments(env.DB, params({ kind: 'tape' }))).rows).toHaveLength(SEED_SIZES.parity.members);
    expect(await loadAdminComments(env.DB, params({ kind: 'song' }))).toEqual({ kind: 'song', rows: [], next: null });
  });

  it('loads the moderation queue', async () => {
    const tape = await one<{ title: string }>('SELECT title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const model = await loadAdminReviews(env.DB);
    expect(model.reviews).toEqual([]);
    expect(model.corrections).toMatchObject([{ proposedChange: 'ปีที่ออกน่าจะเป็น 2531', sourceUrl: 'https://example.com/proof', targetKind: 'tape', targetTitle: tape.title }]);
  });

  it('loads a record\'s sources, and null for a bad kind, id or record', async () => {
    const tape = await one<{ title: string }>('SELECT title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const model = await loadAdminSources(env.DB, params({ kind: 'tape', id: seeded.tapeIds[0] }));
    expect(model).toMatchObject({ kind: 'tape', id: seeded.tapeIds[0], title: tape.title, sources: [{ title: 'แหล่งอ้างอิงเทป' }] });
    const artist = await loadAdminSources(env.DB, params({ kind: 'artist', id: seeded.artistIds[0] }));
    expect(artist).toMatchObject({ title: 'คาราบาว 1', sources: [{ title: 'แหล่งอ้างอิงศิลปิน' }] });

    expect(await loadAdminSources(env.DB, params({ kind: 'label', id: seeded.tapeIds[0] }))).toBeNull();
    expect(await loadAdminSources(env.DB, params({ kind: 'tape', id: 'not-a-uuid' }))).toBeNull();
    expect(await loadAdminSources(env.DB, params({ kind: 'tape', id: missingId() }))).toBeNull();
  });

  it('loads a tape\'s person credits with people and sources, and null for a bad kind or record', async () => {
    const tape = await one<{ title: string }>('SELECT title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const model = await loadAdminCredits(env.DB, params({ kind: 'tape', id: seeded.tapeIds[0] }));
    expect(model).toMatchObject({ kind: 'tape', id: seeded.tapeIds[0], title: tape.title, people: [{ title: 'บุคคลทดสอบ' }], sources: [{ title: 'แหล่งอ้างอิงเทป' }] });
    expect(model!.credits).toMatchObject([{ creditedAs: 'บุคคลทดสอบ', role: 'โปรดิวเซอร์', personName: 'บุคคลทดสอบ' }]);
    expect(await loadAdminCredits(env.DB, params({ kind: 'song', id: seeded.songIds[0] }))).toMatchObject({ kind: 'song', sources: [], credits: [] });

    expect(await loadAdminCredits(env.DB, params({ kind: 'artist', id: seeded.artistIds[0] }))).toBeNull();
    expect(await loadAdminCredits(env.DB, params({ kind: 'song', id: missingId() }))).toBeNull();
  });

  it('loads artist relations and tape editions, and null for a bad kind or record', async () => {
    const artist = await loadAdminRelations(env.DB, params({ kind: 'artist', id: seeded.artistIds[0] }));
    expect(artist).toMatchObject({ kind: 'artist', title: 'คาราบาว 1', sources: [{ title: 'แหล่งอ้างอิงศิลปิน' }], rows: [{ targetTitle: 'แกรนด์เอ็กซ์ 2', relationType: 'related' }] });
    expect(artist!.choices).toHaveLength(SEED_SIZES.parity.artists);

    const tapeTwo = await one<{ title: string }>('SELECT title FROM tape WHERE id = ?', seeded.tapeIds[1]);
    const tape = await loadAdminRelations(env.DB, params({ kind: 'tape', id: seeded.tapeIds[0] }));
    expect(tape).toMatchObject({ kind: 'tape', rows: [{ targetTitle: tapeTwo.title, format: 'cd', editionYear: 2545 }] });
    expect(tape!.choices).toHaveLength(SEED_SIZES.parity.tapes);

    expect(await loadAdminRelations(env.DB, params({ kind: 'song', id: seeded.songIds[0] }))).toBeNull();
    expect(await loadAdminRelations(env.DB, params({ kind: 'artist', id: missingId() }))).toBeNull();
  });

  it('loads people, plus one artist\'s members and sources when asked', async () => {
    const model = await loadAdminPeople(env.DB, params());
    expect(model).toMatchObject({ artist: null, members: [], sources: [], people: [{ name: 'บุคคลทดสอบ' }] });

    const person = await one<{ id: string }>('SELECT id FROM person LIMIT 1');
    const artist = await loadAdminPeople(env.DB, params({ artistId: seeded.artistIds[0] }));
    expect(artist).toMatchObject({ artist: { id: seeded.artistIds[0], name: 'คาราบาว 1' }, members: [{ name: 'สมาชิกวง 1', personId: person.id }], sources: [{ title: 'แหล่งอ้างอิงศิลปิน' }] });
    expect(await loadAdminPeople(env.DB, params({ artistId: missingId() }))).toMatchObject({ artist: null, members: [], sources: [] });
  });

  it('pages the audit log', async () => {
    await recordAudit(env.DB, { actorUserId: seeded.admin.id, actorEmail: seeded.admin.email, action: 'admin.tapes.save', targetId: seeded.tapeIds[0], status: 200 });
    const model = await loadAdminAudit(env.DB, params({ cursor: 'not-a-cursor' }));
    expect(model.nextCursor).toBeNull();
    expect(model.rows).toMatchObject([{ actorEmail: seeded.admin.email, action: 'admin.tapes.save', targetId: seeded.tapeIds[0], status: 200 }]);
  });

  it('lists draft tapes with what they still lack', async () => {
    const model = await loadAdminReadiness(env.DB);
    expect(model.tapes).toHaveLength(6);
    for (const tape of model.tapes) {
      expect(tape.trackCount).toBe(4);
      expect(tape.issues).toContain('ยังไม่มีรูป');
    }
  });

  it('finds a tape image\'s original, and null for an unknown image', async () => {
    const image = await one<{ id: string; fullKey: string }>('SELECT id, fullKey FROM tape_image WHERE tapeId = ?', seeded.tapeIds[0]);
    expect(await loadAdminTapeImage(env.DB, image.id)).toEqual({ fullKey: image.fullKey });
    expect(await loadAdminTapeImage(env.DB, missingId())).toBeNull();
  });
});

describe('admin lookup and middleware repositories', () => {
  it('looks up records by lowercased name or title with LIKE wildcards escaped', async () => {
    const artists = await lookupAdminChoices(env.DB, 'artists', '%คาราบาว%');
    expect(artists.length).toBeGreaterThan(0);
    expect(artists.every(choice => choice.label.includes('คาราบาว'))).toBe(true);
    expect(await lookupAdminChoices(env.DB, 'artists', '%\\%%')).toEqual([]);
    const tape = await one<{ id: string; title: string }>('SELECT id, title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    expect(await lookupAdminChoices(env.DB, 'tapes', `%${tape.title}%`)).toContainEqual({ id: tape.id, label: tape.title });
  });

  it('reads the session user, deletes a session and resolves stored redirects', async () => {
    expect(await getSessionUserRow(env.DB, seeded.admin.id)).toMatchObject({ id: seeded.admin.id, email: seeded.admin.email, role: 'admin', commentBanned: 0, image: null });
    expect(await getSessionUserRow(env.DB, missingId())).toBeNull();

    const sessionId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)').bind(sessionId, Date.now() + 60_000, sessionId, Date.now(), Date.now(), seeded.admin.id).run();
    await deleteSession(env.DB, sessionId);
    expect(await env.DB.prepare('SELECT id FROM session WHERE id = ?').bind(sessionId).first()).toBeNull();

    await env.DB.prepare('INSERT INTO redirect (fromPath, toPath, createdAt) VALUES (?, ?, ?)').bind('/tapes/old-slug-for-test', '/tapes/new-slug-for-test', Date.now()).run();
    expect(await getRedirectTarget(env.DB, '/tapes/old-slug-for-test')).toEqual({ toPath: '/tapes/new-slug-for-test' });
    expect(await getRedirectTarget(env.DB, '/tapes/never-existed')).toBeNull();
  });
});
