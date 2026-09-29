import type { SqlClient } from '../db/sql-client';
import { slugCandidates } from '../domain/slug';
import { getRecordId } from '../repositories/admin.repo';
import { getArtistMemberArtist, setArtistMemberPerson } from '../repositories/artists.repo';
import { getPersonIdBySlug, insertPerson } from '../repositories/people.repo';
import { getArtistCatalogSourceId } from '../repositories/sources.repo';

export async function createPerson(db: SqlClient, rawName: string) {
  const name = rawName.trim().normalize('NFC');
  if (!name || [...name].length > 100) throw new Error('ชื่อบุคคลต้องมี 1–100 ตัวอักษร');
  const candidates = slugCandidates(name);
  if (!candidates.length) throw new Error('ชื่อบุคคลไม่ถูกต้อง');
  const slug = await (async () => {
    for (const candidate of candidates) {
      if (!await getPersonIdBySlug(db, candidate)) return candidate;
    }
    throw new Error('มีชื่อบุคคลนี้หลายรายการ กรุณาตรวจรายการเดิม');
  })();
  const id = crypto.randomUUID();
  const now = Date.now();
  await insertPerson(db, { id, slug, name, now });
  return { id, slug, name };
}

export async function linkArtistMember(db: SqlClient, memberId: string, personId: string | null, sourceId: string | null) {
  const member = await getArtistMemberArtist(db, memberId);
  if (!member) throw new Error('ไม่พบสมาชิกวง');
  if (personId) {
    const person = await getRecordId(db, 'person', personId);
    const source = sourceId ? await getArtistCatalogSourceId(db, sourceId, member.artistId) : null;
    if (!person || !source) throw new Error('ต้องเลือกบุคคลและแหล่งอ้างอิงของศิลปินนี้');
  }
  await setArtistMemberPerson(db, memberId, personId, personId ? sourceId : null);
  return { memberId, personId };
}
