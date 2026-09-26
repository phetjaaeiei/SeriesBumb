import { audioStore, type AudioEnvironment, type AudioStore } from './audio-store';
import { AudioArchiveError, type AudioFile, type AudioProvider, type AudioUsage } from './audio-types';
import { audioFormat, canonicalDriveUrl, validatedAudioStream } from './audio-validation';
export { AudioArchiveError } from './audio-types';
export type { AudioEnvironment } from './audio-store';

export const AUDIO_LIMITS = {
  supabase: { storage: 900_000_000, downloads: 4_000_000_000, file: 50_000_000, requests: 20_000 },
  firebase: { storage: 4_000_000_000, downloads: 40_000_000_000, file: 50_000_000, requests: 20_000 },
} as const;

interface AudioRow extends AudioFile { objectKey: string | null; updatedAt: number }
const FILE_FIELDS = 'id, title, filename, provider, size, contentType, createdAt, note, songId, tapeId, driveUrl, status';
const MAX_FILES = 10_000;

function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AudioArchiveError(400, `กรุณาระบุ${label}`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new AudioArchiveError(400, `${label}ไม่ถูกต้อง`);
  const result = value.trim();
  if (required && !result) throw new AudioArchiveError(400, `กรุณาระบุ${label}`);
  return result || null;
}

function downloadWindow() {
  const now = Date.now();
  return { day: new Date(now).toISOString().slice(0, 10), since: new Date(now - 31 * 86_400_000).toISOString().slice(0, 10) };
}
function enabled(env: AudioEnvironment, provider: AudioProvider): boolean {
  return provider === 'drive' || (provider === 'supabase'
    ? Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY && env.SUPABASE_AUDIO_BUCKET)
    : env.AUDIO_FIREBASE_ENABLED === 'true' && Boolean(env.FIREBASE_STORAGE_BUCKET && env.FIREBASE_SERVICE_ACCOUNT_JSON));
}

export async function audioUsage(env: AudioEnvironment): Promise<AudioUsage[]> {
  const results = await env.DB.batch([
    env.DB.prepare(`SELECT provider, SUM(CASE WHEN status = 'ready' THEN size ELSE 0 END) AS usedBytes,
      SUM(CASE WHEN status != 'ready' THEN size ELSE 0 END) AS reservedBytes FROM audio_file GROUP BY provider`),
    env.DB.prepare('SELECT provider, SUM(bytes) AS bytes FROM audio_download_usage WHERE day >= ? GROUP BY provider').bind(downloadWindow().since),
    env.DB.prepare('SELECT imageBytes FROM site_stats WHERE id = 1'),
  ]);
  const totals = results[0].results as { provider: AudioProvider; usedBytes: number; reservedBytes: number }[];
  const downloads = results[1].results as { provider: AudioProvider; bytes: number }[];
  const imageBytes = Number((results[2].results as { imageBytes: number }[])[0]?.imageBytes ?? 0);
  return (['supabase', 'firebase', 'drive'] as const).map(provider => {
    const total = totals.find(row => row.provider === provider);
    const active = enabled(env, provider);
    const limits = provider === 'drive' ? null : AUDIO_LIMITS[provider];
    return {
      provider, label: { supabase: 'Supabase', firebase: 'Firebase', drive: 'Google Drive' }[provider], enabled: active,
      limitBytes: limits?.storage ?? null, usedBytes: (total?.usedBytes ?? 0) + (provider === 'firebase' ? imageBytes : 0),
      reservedBytes: total?.reservedBytes ?? 0, downloadLimitBytes: limits?.downloads ?? null,
      downloadBytes: downloads.find(row => row.provider === provider)?.bytes ?? 0, maxFileBytes: limits?.file ?? null,
      reason: provider === 'drive' ? 'เก็บเฉพาะลิงก์ พื้นที่และสิทธิ์แชร์จัดการใน Google Drive' : !active
        ? provider === 'firebase' ? 'ปิดคลังเพลง Firebase เพื่อป้องกันค่าใช้จ่าย Blaze' : 'ยังไม่ได้เชื่อมต่อ Supabase Storage'
        : provider === 'firebase' ? 'นับรวมรูปภาพที่เว็บบันทึกไว้ ไม่รวมการใช้งานนอกเว็บ' : 'เพดานของเว็บนี้ โควตาฟรีจริงแชร์ทั้งองค์กร',
    };
  });
}

export async function listAudio(env: AudioEnvironment, query = '', cursor: string | null = null): Promise<{ files: AudioFile[]; nextCursor: string | null; usage: AudioUsage[] }> {
  if (query.length > 200) throw new AudioArchiveError(400, 'คำค้นยาวเกินไป');
  const values: (string | number)[] = [];
  const conditions: string[] = [];
  if (query.trim()) { conditions.push("(title LIKE ? ESCAPE '\\' OR filename LIKE ? ESCAPE '\\')"); const search = `%${query.trim().replace(/[\\%_]/gu, '\\$&')}%`; values.push(search, search); }
  if (cursor) {
    try {
      if (cursor.length > 300) throw new Error('invalid');
      const decoded: unknown = JSON.parse(atob(cursor));
      if (!Array.isArray(decoded) || decoded.length !== 2 || !Number.isSafeInteger(decoded[0]) || typeof decoded[1] !== 'string' || !/^[a-f0-9-]{36}$/u.test(decoded[1])) throw new Error('invalid');
      conditions.push('(createdAt < ? OR (createdAt = ? AND id < ?))'); values.push(decoded[0], decoded[0], decoded[1]);
    } catch { throw new AudioArchiveError(400, 'ตำแหน่งหน้ารายการไม่ถูกต้อง'); }
  }
  const result = await env.DB.prepare(`SELECT ${FILE_FIELDS} FROM audio_file ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY createdAt DESC, id DESC LIMIT 51`).bind(...values).all<AudioFile>();
  const files = result.results.slice(0, 50);
  const last = files.at(-1);
  return { files, nextCursor: result.results.length > 50 && last ? btoa(JSON.stringify([last.createdAt, last.id])) : null, usage: await audioUsage(env) };
}

export async function reserveAudio(env: AudioEnvironment, input: unknown, userId: string): Promise<{ file: AudioFile; uploadUrl?: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AudioArchiveError(400, 'ข้อมูลไฟล์ไม่ถูกต้อง');
  const value = input as Record<string, unknown>;
  const provider = value.provider ?? 'supabase';
  if (provider !== 'supabase' && provider !== 'firebase' && provider !== 'drive') throw new AudioArchiveError(400, 'ผู้ให้บริการไม่ถูกต้อง');
  if (!enabled(env, provider)) throw new AudioArchiveError(503, provider === 'firebase' ? 'ปิดคลังเพลง Firebase เพื่อป้องกันค่าใช้จ่าย Blaze' : 'ยังไม่ได้เชื่อมต่อ Supabase Storage');
  const title = text(value.title, 'ชื่อไฟล์', 200, true)!;
  const filename = text(value.filename ?? (provider === 'drive' ? title : undefined), 'ชื่อไฟล์ต้นฉบับ', 255, true)!;
  if (/[\r\n/\\]/u.test(filename)) throw new AudioArchiveError(400, 'ชื่อไฟล์ต้นฉบับไม่ถูกต้อง');
  const size = value.size ?? (provider === 'drive' ? 0 : undefined);
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < (provider === 'drive' ? 0 : 12) || size > (provider === 'drive' ? Number.MAX_SAFE_INTEGER : AUDIO_LIMITS[provider].file)) throw new AudioArchiveError(413, 'ขนาดไฟล์ไม่ถูกต้องหรือเกิน 50 MB ต่อไฟล์');
  const contentType = provider === 'drive' ? 'application/octet-stream' : audioFormat(filename, text(value.contentType, 'ชนิดไฟล์', 100) ?? '').contentType;
  let driveUrl: string | null = null;
  if (provider === 'drive') {
    if (value.driveRestrictedConfirmed !== true) throw new AudioArchiveError(400, 'กรุณายืนยันว่าตั้งค่าการแชร์ Drive เป็น Restricted และให้สิทธิ์เฉพาะแอดมิน');
    driveUrl = canonicalDriveUrl(text(value.driveUrl, 'ลิงก์ Drive', 1000, true)!);
  }
  const note = text(value.note, 'หมายเหตุ', 2000);
  const songId = text(value.songId, 'รหัสเพลง', 100);
  const tapeId = text(value.tapeId, 'รหัสเทป', 100);
  if (songId && !await env.DB.prepare('SELECT id FROM song WHERE id = ?').bind(songId).first()) throw new AudioArchiveError(400, 'ไม่พบเพลงที่ต้องการเชื่อมโยง');
  if (tapeId && !await env.DB.prepare('SELECT id FROM tape WHERE id = ?').bind(tapeId).first()) throw new AudioArchiveError(400, 'ไม่พบเทปที่ต้องการเชื่อมโยง');
  const id = crypto.randomUUID();
  const now = Date.now();
  const objectKey = provider === 'drive' ? null : `audio/${id}/${id}.${filename.split('.').at(-1)!.toLowerCase()}`;
  const status = provider === 'drive' ? 'ready' : 'pending';
  // One serialized D1 statement counts every reservation, so simultaneous tabs cannot oversubscribe.
  const condition = provider === 'drive' ? '' : `AND (SELECT COALESCE(SUM(size), 0) FROM audio_file WHERE provider = ?) + ? ${provider === 'firebase' ? '+ (SELECT imageBytes FROM site_stats WHERE id = 1)' : ''} <= ?`;
  const bindings = [id, title, filename, provider, size, contentType, objectKey, driveUrl, note, songId, tapeId, status, userId, now, now, MAX_FILES];
  if (provider !== 'drive') bindings.push(provider, size, AUDIO_LIMITS[provider].storage);
  const row = await env.DB.prepare(`INSERT INTO audio_file (id,title,filename,provider,size,contentType,objectKey,driveUrl,note,songId,tapeId,status,createdBy,createdAt,updatedAt)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM audio_file) < ? ${condition} RETURNING ${FILE_FIELDS}`).bind(...bindings).first<AudioFile>();
  if (!row) throw new AudioArchiveError(409, 'พื้นที่เก็บไฟล์หรือจำนวนรายการถึงเพดานแล้ว กรุณาลบรายการที่ไม่ใช้ก่อน');
  return { file: row, ...(provider === 'drive' ? {} : { uploadUrl: `/admin/api/audio/${id}/upload` }) };
}

async function fileRow(env: AudioEnvironment, id: string): Promise<AudioRow> {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new AudioArchiveError(404, 'ไม่พบไฟล์');
  const row = await env.DB.prepare(`SELECT ${FILE_FIELDS}, objectKey, updatedAt FROM audio_file WHERE id = ?`).bind(id).first<AudioRow>();
  if (!row) throw new AudioArchiveError(404, 'ไม่พบไฟล์');
  return row;
}

export async function uploadAudio(env: AudioEnvironment, id: string, request: Request, getStore = audioStore): Promise<AudioFile> {
  const row = await fileRow(env, id);
  if (row.provider === 'drive' || row.status !== 'pending' || !row.objectKey) throw new AudioArchiveError(409, 'รายการนี้ไม่อยู่ในสถานะรออัปโหลด');
  const store = getStore(env, row.provider);
  if (!request.body) throw new AudioArchiveError(400, 'ไม่มีไฟล์อัปโหลด');
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/u.test(length) || Number(length) !== row.size)) throw new AudioArchiveError(400, 'ขนาดไฟล์ไม่ตรงกับที่จองไว้');
  if (request.headers.has('Content-Encoding')) throw new AudioArchiveError(400, 'ไม่รองรับไฟล์ที่บีบอัดระหว่างส่ง');
  const contentType = audioFormat(row.filename, request.headers.get('Content-Type') ?? '').contentType;
  if (contentType !== row.contentType) throw new AudioArchiveError(400, 'ชนิดไฟล์ไม่ตรงกับที่จองไว้');
  const locked = await env.DB.prepare("UPDATE audio_file SET status = 'uploading', updatedAt = ? WHERE id = ? AND status = 'pending' RETURNING id").bind(Date.now(), id).first();
  if (!locked) throw new AudioArchiveError(409, 'ไฟล์นี้กำลังอัปโหลดอยู่แล้ว');
  const deadline = AbortSignal.timeout(120_000);
  try {
    const body = await validatedAudioStream(request.body, row.size, row.filename, deadline);
    deadline.throwIfAborted();
    await store.put(row.objectKey, body.stream, row.size, row.contentType, deadline);
    if (!body.isComplete()) { await body.stream.cancel().catch(() => undefined); throw new AudioArchiveError(502, 'ผู้ให้บริการรับไฟล์ไม่ครบ'); }
    const ready = await env.DB.prepare(`UPDATE audio_file SET status = 'ready', updatedAt = ? WHERE id = ? AND status = 'uploading' RETURNING ${FILE_FIELDS}`).bind(Date.now(), id).first<AudioFile>();
    if (!ready) throw new AudioArchiveError(409, 'สถานะไฟล์เปลี่ยนระหว่างอัปโหลด');
    return ready;
  } catch (error) {
    // Unknown remote state keeps its full reservation until an explicit successful delete.
    await env.DB.prepare("UPDATE audio_file SET status = 'failed', updatedAt = ? WHERE id = ? AND status = 'uploading'").bind(Date.now(), id).run();
    if (error instanceof AudioArchiveError) throw error;
    throw new AudioArchiveError(502, 'อัปโหลดไม่สำเร็จ พื้นที่ยังถูกจองไว้ กรุณาลบรายการก่อนลองใหม่');
  }
}

export async function reserveDownload(env: AudioEnvironment, provider: 'supabase' | 'firebase', size: number): Promise<void> {
  const limits = AUDIO_LIMITS[provider];
  const { day, since } = downloadWindow();
  // Calendar-month resets can straddle a provider's billing cycle. Reserving over
  // 32 UTC date buckets safely covers every possible 31-day billing period.
  // The aggregate guard and UPSERT are one serialized statement, including races.
  const result = await env.DB.prepare(`INSERT INTO audio_download_usage (provider,day,bytes,requests)
    SELECT ?,?,?,1 WHERE (SELECT COALESCE(SUM(bytes), 0) FROM audio_download_usage WHERE provider = ? AND day >= ?) + ? <= ?
      AND (SELECT COALESCE(SUM(requests), 0) FROM audio_download_usage WHERE provider = ? AND day >= ?) < ?
    ON CONFLICT(provider,day) DO UPDATE SET bytes = bytes + excluded.bytes, requests = requests + 1 RETURNING bytes`)
    .bind(provider, day, size, provider, since, size, limits.downloads, provider, since, limits.requests).first();
  if (!result) throw new AudioArchiveError(429, 'ถึงเพดานดาวน์โหลดในช่วง 32 วันที่ผ่านมาแล้ว ระบบหยุดเพื่อควบคุมค่าใช้จ่าย');
}

export async function downloadAudio(env: AudioEnvironment, id: string, getStore: (env: AudioEnvironment, provider: 'supabase' | 'firebase') => AudioStore = audioStore): Promise<Response> {
  const row = await fileRow(env, id);
  if (row.status !== 'ready') throw new AudioArchiveError(409, 'ไฟล์ยังไม่พร้อมดาวน์โหลด');
  if (row.provider === 'drive') return new Response(null, { status: 302, headers: { Location: canonicalDriveUrl(row.driveUrl!), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  const store = getStore(env, row.provider);
  // Charge the entire file before any provider call; failed/cancelled transfers are conservative.
  await reserveDownload(env, row.provider, row.size);
  const object = await store.get(row.objectKey!);
  if (!object) throw new AudioArchiveError(404, 'ไม่พบไฟล์ในพื้นที่จัดเก็บ');
  if (object.size !== undefined && object.size !== row.size) { await object.body.cancel(); throw new AudioArchiveError(502, 'ขนาดไฟล์ในพื้นที่จัดเก็บไม่ตรงกับรายการ'); }
  let received = 0;
  const limitedBody = object.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > row.size) { controller.error(new Error('Audio object exceeds reserved size')); return; }
      controller.enqueue(chunk);
    },
    flush(controller) { if (received !== row.size) controller.error(new Error('Audio object is incomplete')); },
  }));
  const encodedName = encodeURIComponent(row.filename).replace(/['()*]/gu, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(limitedBody, { headers: {
    'Content-Type': row.contentType, 'Content-Length': String(row.size), 'Content-Disposition': `attachment; filename="audio.${row.filename.split('.').at(-1)}"; filename*=UTF-8''${encodedName}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  } });
}

export async function deleteAudio(env: AudioEnvironment, id: string, getStore = audioStore): Promise<void> {
  const row = await fileRow(env, id);
  // Header reads and provider writes share a 120s deadline. Leave a 15min safety
  // window before recovering a reservation left by a terminated Worker.
  const staleBefore = Date.now() - 15 * 60_000;
  if (row.status === 'uploading' && row.updatedAt > staleBefore) throw new AudioArchiveError(409, 'ไฟล์กำลังอัปโหลด กรุณารอให้เสร็จก่อนลบ หากค้างจะลบได้หลัง 15 นาที');
  const locked = await env.DB.prepare("UPDATE audio_file SET status = 'deleting', updatedAt = ? WHERE id = ? AND (status != 'uploading' OR updatedAt <= ?) RETURNING id").bind(Date.now(), id, staleBefore).first();
  if (!locked) throw new AudioArchiveError(409, 'สถานะไฟล์เปลี่ยน กรุณาลองใหม่');
  if (row.provider !== 'drive') await getStore(env, row.provider, true).delete(row.objectKey!);
  // Retrying a failed deletion is safe; bytes are released only after remote success.
  await env.DB.prepare("DELETE FROM audio_file WHERE id = ? AND status = 'deleting'").bind(id).run();
}
