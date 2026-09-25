import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createTapeDraft, saveTape } from '../../src/lib/services/catalog';

const db = env.DB;

async function makeTape() {
  const userId = crypto.randomUUID();
  const now = Date.now();
  await db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
    .bind(userId, 'ผู้ทดสอบรูป', `${userId}@example.com`, now, now).run();
  const tape = await createTapeDraft(db, userId, 'เทปทดสอบลำดับภาพ');
  return { userId, tape };
}

async function addImage(tapeId: string, kind: string, position: number) {
  const id = crypto.randomUUID();
  const fullKey = `tapes/${tapeId}/${id}-full.webp`;
  const thumbKey = `tapes/${tapeId}/${id}-thumb.webp`;
  await db.prepare('INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, ?, ?, ?, 100, 100, 1, ?)')
    .bind(id, tapeId, kind, fullKey, thumbKey, position).run();
  return { id, thumbKey };
}

describe('tape image order', () => {
  it('saves image kinds and order with the tape, then selects the first front image as the cover', async () => {
    const { userId, tape } = await makeTape();
    const first = await addImage(tape.id, 'front', 0);
    const second = await addImage(tape.id, 'back', 1);
    const third = await addImage(tape.id, 'other', 2);

    await saveTape(db, userId, {
      id: tape.id, title: 'เทปทดสอบลำดับภาพ', releaseType: 'compilation', status: 'draft',
      images: [{ id: third.id, kind: 'front' }, { id: first.id, kind: 'back' }, { id: second.id, kind: 'inside' }],
    });

    const images = await db.prepare('SELECT id, kind, position FROM tape_image WHERE tapeId = ? ORDER BY position')
      .bind(tape.id).all<{ id: string; kind: string; position: number }>();
    expect(images.results).toEqual([
      { id: third.id, kind: 'front', position: 0 },
      { id: first.id, kind: 'back', position: 1 },
      { id: second.id, kind: 'inside', position: 2 },
    ]);
    const cover = await db.prepare('SELECT coverImageId, coverThumbKey FROM tape WHERE id = ?')
      .bind(tape.id).first<{ coverImageId: string | null; coverThumbKey: string | null }>();
    expect(cover).toEqual({ coverImageId: third.id, coverThumbKey: third.thumbKey });
  });

  it('rejects a missing, duplicate, or foreign image instead of changing the tape', async () => {
    const { userId, tape } = await makeTape();
    const own = await addImage(tape.id, 'front', 0);
    const otherTape = await makeTape();
    const foreign = await addImage(otherTape.tape.id, 'front', 0);
    const base = { id: tape.id, title: 'เทปทดสอบลำดับภาพ', releaseType: 'compilation' as const, status: 'draft' as const };

    await expect(saveTape(db, userId, { ...base, images: [] })).rejects.toThrow();
    await expect(saveTape(db, userId, { ...base, images: [{ id: own.id, kind: 'back' }, { id: own.id, kind: 'front' }] })).rejects.toThrow();
    await expect(saveTape(db, userId, { ...base, images: [{ id: foreign.id, kind: 'front' }] })).rejects.toThrow();

    const image = await db.prepare('SELECT kind, position FROM tape_image WHERE id = ?').bind(own.id).first<{ kind: string; position: number }>();
    expect(image).toEqual({ kind: 'front', position: 0 });
    const cover = await db.prepare('SELECT coverImageId FROM tape WHERE id = ?').bind(tape.id).first<{ coverImageId: string | null }>();
    expect(cover?.coverImageId).toBeNull();
  });
});
