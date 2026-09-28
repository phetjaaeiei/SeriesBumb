import type { APIContext } from 'astro';
import { toJsonError } from '../errors/to-response';
import { AudioArchiveError } from '../services/audio-types';

export function audioJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}

export async function adminAudioRoute(context: Pick<APIContext, 'locals' | 'request'>, siteUrl: string, mutate: boolean, action: () => Promise<Response>): Promise<Response> {
  const { user, session } = context.locals;
  if (!user || !session || new Date(session.expiresAt).getTime() <= Date.now() || !Number.isFinite(new Date(session.expiresAt).getTime())) return audioJson({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  if (user.role !== 'admin') return audioJson({ error: 'คลังเพลงนี้สำหรับแอดมินเท่านั้น' }, 403);
  const origin = context.request.headers.get('Origin');
  const site = new URL(siteUrl).origin;
  if (context.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (mutate && origin !== site) || (origin && origin !== site)) return audioJson({ error: 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น' }, 403);
  try {
    const response = await action();
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    // Provider errors/credentials and private filenames must never be reflected or logged.
    return toJsonError(error, 'จัดการคลังเพลงไม่สำเร็จ กรุณาลองใหม่', audioJson);
  }
}

export async function readAudioJson(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new AudioArchiveError(415, 'ต้องส่งข้อมูลแบบ JSON');
  if (!request.body) throw new AudioArchiveError(400, 'ไม่มีข้อมูลไฟล์');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 16_384) { await reader.cancel(); throw new AudioArchiveError(413, 'ข้อมูลไฟล์ยาวเกินไป'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AudioArchiveError(400, 'ข้อมูล JSON ไม่ถูกต้อง'); }
}
