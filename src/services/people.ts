import { slugCandidates } from '../domain/slug';

export async function createPerson(db: D1Database, rawName: string) {
  const name = rawName.trim().normalize('NFC');
  if (!name || [...name].length > 100) throw new Error('ชื่อบุคคลต้องมี 1–100 ตัวอักษร');
  const candidates = slugCandidates(name);
  if (!candidates.length) throw new Error('ชื่อบุคคลไม่ถูกต้อง');
  const slug = await (async () => {
    for (const candidate of candidates) {
      if (!await db.prepare('SELECT id FROM person WHERE slug = ?').bind(candidate).first()) return candidate;
    }
    throw new Error('มีชื่อบุคคลนี้หลายรายการ กรุณาตรวจรายการเดิม');
  })();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.prepare('INSERT INTO person (id, slug, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)').bind(id, slug, name, now, now).run();
  return { id, slug, name };
}

export async function linkArtistMember(db: D1Database, memberId: string, personId: string | null, sourceId: string | null) {
  const member = await db.prepare('SELECT id, artistId FROM artist_member WHERE id = ?').bind(memberId).first<{ id: string; artistId: string }>();
  if (!member) throw new Error('ไม่พบสมาชิกวง');
  if (personId) {
    const person = await db.prepare('SELECT id FROM person WHERE id = ?').bind(personId).first();
    const source = sourceId ? await db.prepare("SELECT id FROM catalog_source WHERE id = ? AND entityKind = 'artist' AND entityId = ?").bind(sourceId, member.artistId).first() : null;
    if (!person || !source) throw new Error('ต้องเลือกบุคคลและแหล่งอ้างอิงของศิลปินนี้');
  }
  await db.prepare('UPDATE artist_member SET personId = ?, sourceId = ? WHERE id = ?').bind(personId, personId ? sourceId : null, memberId).run();
  return { memberId, personId };
}
