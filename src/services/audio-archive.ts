import { AUDIO_LIMITS } from '../domain/audio';
import { getRecordId } from '../repositories/admin.repo';
import {
  deleteDeletingAudio, getAudioFileRow, getAudioUsageRows, insertAudioReservation, listAudioFiles, lockAudioForDelete, lockAudioForSigning,
  lockPendingAudioUpload, markAudioCheckFailed, markCheckedAudioReady, markUploadedAudioReady, markUploadingAudioFailed, reserveAudioDownload,
  restoreAudioSignState, type AudioFileRow,
} from '../repositories/audio.repo';
import { audioStore, supabaseAudioStore, type AudioEnvironment, type AudioStore, type DirectAudioStore } from '../storage/audio-store';
import { AudioArchiveError, type AudioFile, type AudioProvider, type AudioUsage } from './audio-types';
import { audioFormat, canonicalDriveUrl, validAudioSignature, validatedAudioStream } from './audio-validation';
export { AudioArchiveError } from './audio-types';
export type { AudioEnvironment } from '../storage/audio-store';
export { AUDIO_LIMITS };

const MAX_FILES = 10_000;
const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60_000;
const SIGNED_UPLOAD_DELETE_GRACE_MS = 15 * 60_000;

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
  const usage = await getAudioUsageRows(env.DB, downloadWindow().since);
  const { totals, downloads } = usage;
  const imageBytes = Number(usage.imageBytes ?? 0);
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
  const search = query.trim() ? `%${query.trim().replace(/[\\%_]/gu, '\\$&')}%` : null;
  let before: [number, string] | null = null;
  if (cursor) {
    try {
      if (cursor.length > 300) throw new Error('invalid');
      const decoded: unknown = JSON.parse(atob(cursor));
      if (!Array.isArray(decoded) || decoded.length !== 2 || !Number.isSafeInteger(decoded[0]) || typeof decoded[1] !== 'string' || !/^[a-f0-9-]{36}$/u.test(decoded[1])) throw new Error('invalid');
      before = [decoded[0], decoded[1]];
    } catch { throw new AudioArchiveError(400, 'ตำแหน่งหน้ารายการไม่ถูกต้อง'); }
  }
  const results = await listAudioFiles(env.DB, search, before);
  const files = results.slice(0, 50);
  const last = files.at(-1);
  return { files, nextCursor: results.length > 50 && last ? btoa(JSON.stringify([last.createdAt, last.id])) : null, usage: await audioUsage(env) };
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
  if (songId && !await getRecordId(env.DB, 'song', songId)) throw new AudioArchiveError(400, 'ไม่พบเพลงที่ต้องการเชื่อมโยง');
  if (tapeId && !await getRecordId(env.DB, 'tape', tapeId)) throw new AudioArchiveError(400, 'ไม่พบเทปที่ต้องการเชื่อมโยง');
  const id = crypto.randomUUID();
  const now = Date.now();
  const objectKey = provider === 'drive' ? null : `audio/${id}/${id}.${filename.split('.').at(-1)!.toLowerCase()}`;
  const status = provider === 'drive' ? 'ready' : 'pending';
  // One serialized D1 statement counts every reservation, so simultaneous tabs cannot oversubscribe.
  const quota = provider === 'drive' ? null : { reserveBytes: provider === 'supabase' ? AUDIO_LIMITS.supabase.signedUpload : size, storageLimit: AUDIO_LIMITS[provider].storage };
  const row = await insertAudioReservation(env.DB, { id, title, filename, provider, size, contentType, objectKey, driveUrl, note, songId, tapeId, status, createdBy: userId, now }, MAX_FILES, quota);
  if (!row) throw new AudioArchiveError(409, 'พื้นที่เก็บไฟล์หรือจำนวนรายการถึงเพดานแล้ว กรุณาลบรายการที่ไม่ใช้ก่อน');
  return { file: row, ...(provider === 'drive' ? {} : { uploadUrl: `/admin/api/audio/${id}/upload` }) };
}

async function fileRow(env: AudioEnvironment, id: string): Promise<AudioFileRow> {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new AudioArchiveError(404, 'ไม่พบไฟล์');
  const row = await getAudioFileRow(env.DB, id);
  if (!row) throw new AudioArchiveError(404, 'ไม่พบไฟล์');
  return row;
}

/** The signed URL only grants creation at the already reserved object key. */
export async function signAudio(env: AudioEnvironment, id: string, getStore: (env: AudioEnvironment) => DirectAudioStore = supabaseAudioStore): Promise<{
  uploadUrl: string; uploadMethod: 'PUT'; uploadHeaders: { 'Content-Type': string; 'x-upsert': 'false' }; expiresInSeconds: 7200;
}> {
  const row = await fileRow(env, id);
  if (row.provider !== 'supabase' || !row.objectKey) throw new AudioArchiveError(409, 'รายการนี้ไม่ได้ใช้ Supabase');
  const firstSign = row.status === 'pending' && row.signedAt === null;
  const retrySign = (row.status === 'uploading' || row.status === 'failed') && row.signedAt !== null;
  if (!firstSign && !retrySign) throw new AudioArchiveError(409, 'รายการนี้ไม่อยู่ในสถานะออกลิงก์อัปโหลด');
  const store = getStore(env);
  try { await store.assertBucketUploadLimit(AUDIO_LIMITS.supabase.signedUpload); }
  catch (error) {
    if (!(error instanceof AudioArchiveError)) console.error('audio_sign_bucket_failed', error instanceof Error ? error.name : 'unknown');
    throw error;
  }
  if (retrySign && await store.head(row.objectKey)) throw new AudioArchiveError(409, 'พบไฟล์ใน Supabase แล้ว กรุณาตรวจสอบไฟล์แทนการอัปโหลดซ้ำ');
  const signedAt = Date.now();
  // New rows reserve the full bucket maximum on creation. This serialized
  // guard also blocks signing any legacy pending row if old data exceeds cap.
  let locked;
  try {
    locked = await lockAudioForSigning(env.DB, id, signedAt, row.status, row.signedAt, AUDIO_LIMITS.supabase.storage);
  } catch (error) {
    console.error('audio_sign_lock_failed', error instanceof Error ? error.name : 'unknown');
    throw error;
  }
  if (!locked) throw new AudioArchiveError(409, 'พื้นที่ไม่พอสำหรับลิงก์อัปโหลด หรือสถานะไฟล์เปลี่ยนแล้ว');
  try {
    const uploadUrl = await store.signUpload(row.objectKey);
    return { uploadUrl, uploadMethod: 'PUT', uploadHeaders: { 'Content-Type': row.contentType, 'x-upsert': 'false' }, expiresInSeconds: 7200 };
  } catch (error) {
    if (!(error instanceof AudioArchiveError)) console.error('audio_sign_provider_failed', error instanceof Error ? error.name : 'unknown');
    // If no URL reached the caller, restore the previous reservation state.
    await restoreAudioSignState(env.DB, id, row.status, row.signedAt, Date.now(), signedAt);
    throw error;
  }
}

/** Verify the provider's object before changing reserved bytes to ready bytes. */
export async function finalizeAudio(env: AudioEnvironment, id: string, getStore: (env: AudioEnvironment) => DirectAudioStore = supabaseAudioStore): Promise<AudioFile> {
  const row = await fileRow(env, id);
  if (row.provider !== 'supabase' || !row.objectKey) throw new AudioArchiveError(409, 'รายการนี้ไม่ได้ใช้ Supabase');
  if (row.status === 'ready') return row;
  if (row.status !== 'uploading' && row.status !== 'failed') throw new AudioArchiveError(409, 'รายการนี้ยังไม่อยู่ในสถานะตรวจสอบไฟล์');
  const store = getStore(env);
  const metadata = await store.head(row.objectKey);
  if (!metadata) throw new AudioArchiveError(409, 'ยังไม่พบไฟล์ใน Supabase กรุณารอให้อัปโหลดเสร็จ');
  if (metadata.size !== row.size || metadata.contentType !== row.contentType) {
    await markAudioCheckFailed(env.DB, id, Date.now());
    throw new AudioArchiveError(400, 'ขนาดหรือชนิดไฟล์ใน Supabase ไม่ตรงกับที่จองไว้ กรุณาลบรายการนี้');
  }
  const prefix = await store.prefix(row.objectKey, row.size);
  if (!validAudioSignature(prefix, row.filename)) {
    await markAudioCheckFailed(env.DB, id, Date.now());
    throw new AudioArchiveError(400, 'เนื้อหาไฟล์ไม่ใช่ไฟล์เพลงชนิดที่ระบุ กรุณาลบรายการนี้');
  }
  const ready = await markCheckedAudioReady(env.DB, id, Date.now());
  if (ready) return ready;
  const current = await fileRow(env, id);
  if (current.status === 'ready') return current;
  throw new AudioArchiveError(409, 'สถานะไฟล์เปลี่ยนระหว่างตรวจสอบ');
}

export async function uploadAudio(env: AudioEnvironment, id: string, request: Request, getStore = audioStore): Promise<AudioFile> {
  const row = await fileRow(env, id);
  if (row.provider === 'supabase') throw new AudioArchiveError(409, 'ไฟล์ Supabase ต้องอัปโหลดผ่านลิงก์ที่ลงชื่อแล้ว');
  if (row.provider === 'drive' || row.status !== 'pending' || !row.objectKey) throw new AudioArchiveError(409, 'รายการนี้ไม่อยู่ในสถานะรออัปโหลด');
  const store = getStore(env, row.provider);
  if (!request.body) throw new AudioArchiveError(400, 'ไม่มีไฟล์อัปโหลด');
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/u.test(length) || Number(length) !== row.size)) throw new AudioArchiveError(400, 'ขนาดไฟล์ไม่ตรงกับที่จองไว้');
  if (request.headers.has('Content-Encoding')) throw new AudioArchiveError(400, 'ไม่รองรับไฟล์ที่บีบอัดระหว่างส่ง');
  const contentType = audioFormat(row.filename, request.headers.get('Content-Type') ?? '').contentType;
  if (contentType !== row.contentType) throw new AudioArchiveError(400, 'ชนิดไฟล์ไม่ตรงกับที่จองไว้');
  const locked = await lockPendingAudioUpload(env.DB, id, Date.now());
  if (!locked) throw new AudioArchiveError(409, 'ไฟล์นี้กำลังอัปโหลดอยู่แล้ว');
  const deadline = AbortSignal.timeout(120_000);
  try {
    const body = await validatedAudioStream(request.body, row.size, row.filename, deadline);
    deadline.throwIfAborted();
    await store.put(row.objectKey, body.stream, row.size, row.contentType, deadline);
    if (!body.isComplete()) { await body.stream.cancel().catch(() => undefined); throw new AudioArchiveError(502, 'ผู้ให้บริการรับไฟล์ไม่ครบ'); }
    const ready = await markUploadedAudioReady(env.DB, id, Date.now());
    if (!ready) throw new AudioArchiveError(409, 'สถานะไฟล์เปลี่ยนระหว่างอัปโหลด');
    return ready;
  } catch (error) {
    // Unknown remote state keeps its full reservation until an explicit successful delete.
    await markUploadingAudioFailed(env.DB, id, Date.now());
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
  const result = await reserveAudioDownload(env.DB, provider, day, since, size, limits.downloads, limits.requests);
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
  const now = Date.now();
  const signedDeleteAfter = row.signedAt === null ? null : row.signedAt + SIGNED_UPLOAD_TTL_MS + SIGNED_UPLOAD_DELETE_GRACE_MS;
  // A signed token can recreate the object after deletion, leaving untracked storage.
  // Keep the reservation and object until the token has expired with a safety margin.
  if (signedDeleteAfter !== null && now < signedDeleteAfter) {
    throw new AudioArchiveError(409, `ลบไฟล์นี้ได้หลังลิงก์อัปโหลดหมดอายุ กรุณารออีก ${Math.ceil((signedDeleteAfter - now) / 60_000)} นาที`);
  }
  // Header reads and provider writes share a 120s deadline. Leave a 15min safety
  // window before recovering a reservation left by a terminated Worker.
  const staleBefore = now - 15 * 60_000;
  if (row.status === 'uploading' && row.updatedAt > staleBefore) throw new AudioArchiveError(409, 'ไฟล์กำลังอัปโหลด กรุณารอให้เสร็จก่อนลบ หากค้างจะลบได้หลัง 15 นาที');
  const signedStaleBefore = now - SIGNED_UPLOAD_TTL_MS - SIGNED_UPLOAD_DELETE_GRACE_MS;
  // A verified ready object's token has expired by now, so it keeps charging only its size.
  const locked = await lockAudioForDelete(env.DB, id, now, signedStaleBefore, staleBefore);
  if (!locked) throw new AudioArchiveError(409, 'สถานะไฟล์เปลี่ยน กรุณาลองใหม่');
  if (row.provider !== 'drive') await getStore(env, row.provider, true).delete(row.objectKey!);
  // Retrying a failed deletion is safe; bytes are released only after remote success.
  await deleteDeletingAudio(env.DB, id);
}
