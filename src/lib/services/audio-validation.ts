import { AudioArchiveError } from './audio-types';

const FORMATS = {
  mp3: { mime: 'audio/mpeg', aliases: ['audio/mpeg', 'audio/mp3'] },
  flac: { mime: 'audio/flac', aliases: ['audio/flac', 'audio/x-flac'] },
  wav: { mime: 'audio/wav', aliases: ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'] },
  m4a: { mime: 'audio/mp4', aliases: ['audio/mp4', 'audio/m4a', 'audio/x-m4a'] },
  ogg: { mime: 'audio/ogg', aliases: ['audio/ogg', 'application/ogg'] },
} as const;

export function audioFormat(filename: string, suppliedMime: string): { extension: keyof typeof FORMATS; contentType: string } {
  const extension = filename.split('.').at(-1)?.toLowerCase();
  if (!extension || !Object.hasOwn(FORMATS, extension)) throw new AudioArchiveError(400, 'รองรับไฟล์ MP3, FLAC, WAV, M4A และ OGG เท่านั้น');
  const format = FORMATS[extension as keyof typeof FORMATS];
  const mime = suppliedMime.split(';')[0].trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream' && !format.aliases.some(alias => alias === mime)) {
    throw new AudioArchiveError(400, 'ชนิดไฟล์ไม่ตรงกับนามสกุล');
  }
  return { extension: extension as keyof typeof FORMATS, contentType: format.mime };
}

export function canonicalDriveUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AudioArchiveError(400, 'ลิงก์ Google Drive ไม่ถูกต้อง'); }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.port || url.username || url.password) {
    throw new AudioArchiveError(400, 'ใช้ลิงก์ไฟล์ https://drive.google.com เท่านั้น');
  }
  const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:view|preview))?\/?$/u);
  const id = match?.[1] ?? (url.pathname === '/open' ? url.searchParams.get('id') : null);
  if (!id || !/^[A-Za-z0-9_-]{10,200}$/u.test(id)) throw new AudioArchiveError(400, 'ใช้ลิงก์ของไฟล์ใน Drive ไม่ใช่ลิงก์โฟลเดอร์');
  return `https://drive.google.com/file/d/${id}/view`;
}

function validSignature(bytes: Uint8Array, filename: string): boolean {
  const text = (offset: number, value: string) => [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const extension = filename.split('.').at(-1)?.toLowerCase();
  if (extension === 'mp3') return text(0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0);
  if (extension === 'flac') return text(0, 'fLaC');
  if (extension === 'wav') return text(0, 'RIFF') && text(8, 'WAVE');
  if (extension === 'm4a') return text(4, 'ftyp');
  if (extension === 'ogg') return text(0, 'OggS');
  return false;
}

/** Only the first 12 signature bytes are copied. The rest streams with backpressure. */
export async function validatedAudioStream(body: ReadableStream<Uint8Array>, expectedSize: number, filename: string, deadline = AbortSignal.timeout(120_000)) {
  const reader = body.getReader();
  deadline.addEventListener('abort', () => { void reader.cancel('Audio upload timed out').catch(() => undefined); }, { once: true });
  const header = new Uint8Array(12);
  const prefix: Uint8Array[] = [];
  let signatureBytes = 0;
  let count = 0;
  try {
    while (signatureBytes < header.length) {
      const next = await reader.read();
      if (next.done) throw new AudioArchiveError(400, 'ไฟล์เพลงไม่ครบหรือมีขนาดเล็กเกินไป');
      count += next.value.byteLength;
      if (count > expectedSize) throw new AudioArchiveError(413, 'ขนาดไฟล์เกินที่จองไว้');
      prefix.push(next.value);
      const copied = Math.min(header.length - signatureBytes, next.value.byteLength);
      header.set(next.value.subarray(0, copied), signatureBytes);
      signatureBytes += copied;
    }
    if (!validSignature(header, filename)) throw new AudioArchiveError(400, 'เนื้อหาไฟล์ไม่ใช่ไฟล์เพลงชนิดที่ระบุ');
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  let complete = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const buffered = prefix.shift();
        if (buffered) { controller.enqueue(buffered); return; }
        const next = await reader.read();
        if (next.done) {
          if (count !== expectedSize) throw new AudioArchiveError(400, 'ขนาดไฟล์จริงไม่ตรงกับที่จองไว้');
          complete = true;
          controller.close();
          return;
        }
        count += next.value.byteLength;
        if (count > expectedSize) throw new AudioArchiveError(413, 'ขนาดไฟล์เกินที่จองไว้');
        controller.enqueue(next.value);
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        controller.error(error);
      }
    },
    async cancel(reason) { await reader.cancel(reason); },
  }, { highWaterMark: 0 });
  return { stream, isComplete: () => complete };
}
