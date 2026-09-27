/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AudioArchive from '../../src/components/admin/AudioArchive';

vi.mock('astro:actions', () => ({ actions: { admin: { lookup: vi.fn() } } }));
const usage = [
  { provider: 'supabase', label: 'Supabase', enabled: true, usedBytes: 0, reservedBytes: 0, limitBytes: 900_000_000, maxFileBytes: 50_000_000, downloadBytes: 0, downloadLimitBytes: 4_000_000_000 },
  { provider: 'firebase', label: 'Firebase', enabled: false, usedBytes: 0, reservedBytes: 0, limitBytes: 4_000_000_000, maxFileBytes: 50_000_000, downloadBytes: 0, downloadLimitBytes: 80_000_000_000, reason: 'ปิดเพื่อควบคุมค่าใช้จ่าย' },
  { provider: 'drive', label: 'Google Drive', enabled: true, usedBytes: 0, reservedBytes: 0, limitBytes: null, maxFileBytes: null, downloadBytes: 0, downloadLimitBytes: null },
];
// An ID3 header, so the browser-side signature check accepts it as MP3.
const mp3File = (name = 'demo.mp3') => new File([new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 1, 2]), 'fake mp3 audio payload'], name, { type: 'audio/mpeg' });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(React.createElement(AudioArchive)));
  return host;
}

function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(node => node.textContent === label)!;
}

async function inputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('admin audio archive', () => {
  it('uploads to a signed Supabase URL without credentials, then finalizes the reserved file', async () => {
    const fileId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const upload = { url: '', headers: {} as Record<string, string>, withCredentials: true, size: 0 };
    class MockUploadRequest {
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      withCredentials = true;
      status = 200;
      responseURL = '';
      responseText = '';
      timeout = 0;
      open(method: string, url: string) { expect(method).toBe('PUT'); upload.url = url; this.responseURL = url; }
      setRequestHeader(name: string, value: string) { upload.headers[name] = value; }
      send(file: File) {
        upload.withCredentials = this.withCredentials;
        upload.size = file.size;
        queueMicrotask(() => { this.upload.onprogress?.({ lengthComputable: true, loaded: file.size, total: file.size } as ProgressEvent); this.onload?.(); });
      }
      abort() { this.onabort?.(); }
    }
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/sign')) return json({ uploadUrl: `https://project.supabase.co/storage/v1/object/upload/sign/SeriesBumb/audio/${fileId}/${fileId}.mp3?token=short-lived`, uploadMethod: 'PUT', uploadHeaders: { 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' }, expiresInSeconds: 7200 });
      if (url.endsWith('/finalize')) return json({ file: { id: fileId, status: 'ready' } });
      if (url === '/admin/api/audio' && options?.method === 'POST') return json({ file: { id: fileId, status: 'pending' }, uploadUrl: `/admin/api/audio/${fileId}/upload` });
      return json({ files: [], usage, nextCursor: null });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', MockUploadRequest);
    const host = await mount();
    await act(async () => button(host, 'อัปโหลดไฟล์').click());
    const file = mp3File();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    const form = host.querySelector<HTMLFormElement>('.audio-form')!;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(`/admin/api/audio/${fileId}/sign`);
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(`/admin/api/audio/${fileId}/finalize`);
    expect(upload.url).toMatch(/^https:\/\/project\.supabase\.co\/storage\/v1\/object\/upload\/sign\//u);
    expect(upload.headers).toEqual({ 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' });
    expect(upload.withCredentials).toBe(false);
    expect(upload.size).toBe(file.size);
    expect(host.textContent).toContain('เก็บไฟล์เพลงแล้ว');
  });

  it('refuses to send audio to an unrelated HTTPS signed URL', async () => {
    const fileId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/sign')) return json({ uploadUrl: `https://unrelated.example/storage/v1/object/upload/sign/SeriesBumb/audio/${fileId}/${fileId}.mp3?token=forged`, uploadMethod: 'PUT', uploadHeaders: { 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' }, expiresInSeconds: 7200 });
      if (url === '/admin/api/audio' && options?.method === 'POST') return json({ file: { id: fileId, status: 'pending' }, uploadUrl: `/admin/api/audio/${fileId}/upload` });
      return json({ files: [], usage, nextCursor: null });
    });
    const xhrMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', xhrMock);
    const host = await mount();
    await act(async () => button(host, 'อัปโหลดไฟล์').click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [mp3File()] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => { host.querySelector<HTMLFormElement>('.audio-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(`/admin/api/audio/${fileId}/sign`);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(`/admin/api/audio/${fileId}/finalize`);
    expect(xhrMock).not.toHaveBeenCalled();
    // The reload omits the reserved row here, so the guidance falls back to the page alert.
    expect(host.querySelector('.audio-error')?.textContent).toContain('ระบบส่งตำแหน่งอัปโหลดไม่ถูกต้อง');
  });

  it('treats an empty 204 DELETE response as a successful removal', async () => {
    const row = { id: 'audio-file', title: 'เพลงเก่า', filename: 'music.mp3', provider: 'supabase', size: 1000, status: 'ready', createdAt: Date.now() };
    let deleted = false;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/audio-file') && options?.method === 'DELETE') {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return json({ files: deleted ? [] : [row], usage, nextCursor: null });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const host = await mount();
    const removeButton = [...host.querySelectorAll('button')].find(node => node.textContent?.startsWith('ลบไฟล์'))!;
    await act(async () => { removeButton.click(); await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(fetchMock.mock.calls.some(([url, options]) => url === '/admin/api/audio/audio-file' && options?.method === 'DELETE')).toBe(true);
    expect(host.textContent).toContain('ลบไฟล์เพลงแล้ว');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.audio-file-table')).toBeNull();
  });

  it('reuses an unfinished Supabase row after checking the object, with no new reservation', async () => {
    const fileId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const original = mp3File();
    const row = { id: fileId, title: 'เพลงเก่า', filename: original.name, provider: 'supabase', size: original.size, contentType: 'audio/mpeg', status: 'uploading', createdAt: Date.now() };
    let finalizeCalls = 0;
    let ready = false;
    const order: string[] = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/finalize')) {
        order.push('finalize'); finalizeCalls++;
        if (finalizeCalls === 1) return json({ error: 'ยังไม่พบไฟล์ใน Supabase' }, 409);
        ready = true;
        return json({ file: { ...row, status: 'ready' } });
      }
      if (url.endsWith('/sign')) {
        order.push('sign');
        return json({ uploadUrl: `https://project.supabase.co/storage/v1/object/upload/sign/SeriesBumb/audio/${fileId}/${fileId}.mp3?token=short-lived`, uploadMethod: 'PUT', uploadHeaders: { 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' }, expiresInSeconds: 7200 });
      }
      if (url === '/admin/api/audio' && options?.method === 'POST') throw new Error('retry must not reserve another row');
      return json({ files: [{ ...row, status: ready ? 'ready' : 'uploading' }], usage, nextCursor: null });
    });
    class MockUploadRequest {
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      withCredentials = true;
      status = 200;
      responseURL = '';
      timeout = 0;
      open(method: string, url: string) { expect(method).toBe('PUT'); expect(url).toContain('project.supabase.co'); this.responseURL = url; }
      setRequestHeader() { /* Headers are covered by the initial-upload test. */ }
      send(file: File) { expect(file).toBe(original); expect(this.withCredentials).toBe(false); order.push('upload'); queueMicrotask(() => this.onload?.()); }
      abort() { /* No cancellation in this case. */ }
    }
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', MockUploadRequest);
    const host = await mount();
    expect([...host.querySelectorAll('button')].some(node => node.textContent?.startsWith('ส่งไฟล์เดิม'))).toBe(true);
    const input = host.querySelector<HTMLInputElement>('.audio-retry-input')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['wrong'], original.name, { type: 'audio/mpeg' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(host.querySelector('.audio-retry-error')?.textContent).toContain('ขนาด');
    expect(finalizeCalls).toBe(0);

    Object.defineProperty(input, 'files', { configurable: true, value: [original] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(order).toEqual(['finalize', 'sign', 'upload', 'finalize']);
    expect(fetchMock.mock.calls.some(([url, options]) => url === '/admin/api/audio' && options?.method === 'POST')).toBe(false);
    expect(host.textContent).toContain('ส่งและบันทึกไฟล์ “เพลงเก่า” แล้ว');
  });

  it('rejects a mislabeled file in the browser before reserving a Supabase slot', async () => {
    const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async () => json({ files: [], usage, nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount();
    await act(async () => button(host, 'อัปโหลดไฟล์').click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['<html>not audio</html>'], 'demo.mp3', { type: 'audio/mpeg' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => { host.querySelector<HTMLFormElement>('.audio-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    expect(host.querySelector('.audio-form [role="alert"]')?.textContent).toContain('เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์เพลง');
  });

  it('closes the form after a failed signed upload and guides the admin from the reserved row', async () => {
    const fileId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const source = mp3File();
    let reserved = false;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/sign')) return json({ uploadUrl: `https://project.supabase.co/storage/v1/object/upload/sign/SeriesBumb/audio/${fileId}/${fileId}.mp3?token=short-lived`, uploadMethod: 'PUT', uploadHeaders: { 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' }, expiresInSeconds: 7200 });
      if (url === '/admin/api/audio' && options?.method === 'POST') { reserved = true; return json({ file: { id: fileId, status: 'pending' }, uploadUrl: `/admin/api/audio/${fileId}/upload` }); }
      const row = { id: fileId, title: 'demo', filename: source.name, provider: 'supabase', size: source.size, contentType: 'audio/mpeg', status: 'uploading', createdAt: Date.now() };
      return json({ files: reserved ? [row] : [], usage, nextCursor: null });
    });
    class DroppedUploadRequest {
      upload = { onprogress: null };
      onerror: (() => void) | null = null;
      withCredentials = true;
      timeout = 0;
      open() { /* The connection drops during send. */ }
      setRequestHeader() { /* Headers are covered by the initial-upload test. */ }
      send() { queueMicrotask(() => this.onerror?.()); }
      abort() { /* Not used. */ }
    }
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', DroppedUploadRequest);
    const host = await mount();
    await act(async () => button(host, 'อัปโหลดไฟล์').click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [source] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => { host.querySelector<HTMLFormElement>('.audio-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    // No open form means no second reservation for the same file.
    expect(host.querySelector('.audio-form')).toBeNull();
    expect(host.querySelector('.audio-retry-error')?.textContent).toContain('กด “ส่งไฟล์เดิม” ที่รายการนี้');
    expect(fetchMock.mock.calls.filter(([url, options]) => url === '/admin/api/audio' && options?.method === 'POST')).toHaveLength(1);
  });

  it('does not promise immediate deletion when the sign response is lost', async () => {
    const fileId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    let reserved = false;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/sign')) throw new TypeError('Failed to fetch');
      if (url === '/admin/api/audio' && options?.method === 'POST') { reserved = true; return json({ file: { id: fileId, status: 'pending' }, uploadUrl: `/admin/api/audio/${fileId}/upload` }); }
      const row = { id: fileId, title: 'demo', filename: 'demo.mp3', provider: 'supabase', size: 1000, contentType: 'audio/mpeg', status: 'uploading', createdAt: Date.now() };
      return json({ files: reserved ? [row] : [], usage, nextCursor: null });
    });
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount();
    await act(async () => button(host, 'อัปโหลดไฟล์').click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [mp3File()] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => { host.querySelector<HTMLFormElement>('.audio-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    const guidance = host.querySelector('.audio-retry-error')?.textContent;
    expect(guidance).toContain('รอลิงก์อัปโหลดหมดอายุ');
    expect(guidance).not.toContain('ได้ทันที');
  });

  it('checks the signature of a retried file before asking for a new link', async () => {
    const original = mp3File();
    const mislabeled = new File([new Uint8Array(original.size)], original.name, { type: 'audio/mpeg' });
    const row = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', title: 'เพลงเก่า', filename: original.name, provider: 'supabase', size: original.size, contentType: 'audio/mpeg', status: 'uploading', createdAt: Date.now() };
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => json({ files: [row], usage, nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount();
    const input = host.querySelector<HTMLInputElement>('.audio-retry-input')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [mislabeled] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.querySelector('.audio-retry-error')?.textContent).toContain('เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์เพลง');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/finalize') || url.endsWith('/sign'))).toBe(false);
  });

  it('offers only deletion for a Supabase file that failed verification', async () => {
    const row = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', title: 'เพลงเสีย', filename: 'demo.mp3', provider: 'supabase', size: 1000, contentType: 'audio/mpeg', status: 'failed', createdAt: Date.now() };
    vi.stubGlobal('fetch', vi.fn(async () => json({ files: [row], usage, nextCursor: null })));
    const host = await mount();
    const labels = [...host.querySelectorAll('.audio-file-table button')].map(node => node.textContent);
    expect(labels.some(label => label?.startsWith('ตรวจสอบไฟล์') || label?.startsWith('ส่งไฟล์เดิม'))).toBe(false);
    expect(labels.some(label => label?.startsWith('ลบไฟล์'))).toBe(true);
    expect(host.textContent).toContain('ไฟล์ไม่ผ่านการตรวจสอบ');
  });

  it('keeps a retry failure visible when the reload no longer includes that row', async () => {
    const fileId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const original = mp3File();
    const row = { id: fileId, title: 'เพลงหน้าสอง', filename: original.name, provider: 'supabase', size: original.size, contentType: 'audio/mpeg', status: 'uploading', createdAt: Date.now() };
    let loads = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/finalize')) return json({ error: 'ยังไม่พบไฟล์' }, 409);
      if (url.endsWith('/sign')) return json({ error: 'ออกลิงก์อัปโหลด Supabase ไม่สำเร็จ' }, 502);
      loads++;
      // First load shows the row; the reload after the retry returns a first page without it.
      return json({ files: loads === 1 ? [row] : [], usage, nextCursor: null });
    });
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount();
    const input = host.querySelector<HTMLInputElement>('.audio-retry-input')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [original] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.querySelector('.audio-error')?.textContent).toContain('ส่งไฟล์ “เพลงหน้าสอง” ไม่สำเร็จ');
  });

  it('requires Supabase temporary headroom before reserving even a small file', async () => {
    const nearlyFull = usage.map(item => item.provider === 'supabase' ? { ...item, usedBytes: 850_000_000 } : item);
    const fetchMock = vi.fn(async () => json({ files: [], usage: nearlyFull, nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount();
    await act(async () => button(host, 'อัปโหลดไฟล์').click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [mp3File()] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(host.textContent).toContain('ต้องมีพื้นที่ว่างอย่างน้อย 52.43 MB');
    expect(button(host, 'อัปโหลดไฟล์เพลง').disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks a file above the provider size limit before reserving storage', async () => {
    const fetchMock = vi.fn(async () => json({ files: [], usage, nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount();
    await act(async () => button(host, 'อัปโหลดไฟล์').click());
    const file = new File(['music'], 'side-a.wav', { type: 'audio/wav' });
    Object.defineProperty(file, 'size', { value: 60_000_000 });
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(host.textContent).toContain('ไฟล์ใหญ่เกินขีดจำกัด 50 MB');
    expect(button(host, 'อัปโหลดไฟล์เพลง').disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires Drive privacy confirmation and sends it with the private link', async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'POST'
      ? json({ file: { id: 'drive-file', status: 'ready' } }) : json({ files: [], usage, nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount();
    await act(async () => button(host, 'เพิ่มลิงก์ Google Drive').click());
    const form = host.querySelector<HTMLFormElement>('.audio-form')!;
    await inputValue(form.querySelector<HTMLInputElement>('input[maxlength="200"]')!, 'เพลงจากเทปเก่า');
    await inputValue(form.querySelector<HTMLInputElement>('input[type="url"]')!, 'https://drive.google.com/file/d/private-file/view');
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    expect(host.textContent).toContain('ตรวจสอบสิทธิ์แชร์ไฟล์ใน Google Drive แล้วทำเครื่องหมายยืนยัน');

    await act(async () => form.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toMatchObject({ provider: 'drive', title: 'เพลงจากเทปเก่า', driveRestrictedConfirmed: true, size: 0, contentType: 'application/octet-stream' });
    expect(host.textContent).toContain('เพิ่มลิงก์ Google Drive แล้ว');
  });

  it('shows an expired-session error without treating a login HTML page as archive data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Login</html>', { status: 401, headers: { 'Content-Type': 'text/html' } })));
    const host = await mount();
    expect(host.textContent).toContain('เซสชันหมดอายุ');
    expect(host.querySelector('a[href="/login?next=%2Fadmin%2Faudio"]')).not.toBeNull();
    expect(button(host, 'อัปโหลดไฟล์').disabled).toBe(true);
  });

  it('keeps a download quota error on the archive page without downloading the error JSON', async () => {
    const row = { id: 'audio-file', title: 'เพลงเก่า', filename: 'music.mp3', provider: 'supabase', size: 1000, status: 'ready', createdAt: Date.now() };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/audio-file')
      ? json({ error: 'ถึงขีดจำกัดดาวน์โหลดเดือนนี้แล้ว' }, 429) : json({ files: [row], usage, nextCursor: null })));
    const host = await mount();
    const download = [...host.querySelectorAll('button')].find(node => node.textContent?.startsWith('ดาวน์โหลด'))!;
    await act(async () => download.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ถึงขีดจำกัดดาวน์โหลดเดือนนี้แล้ว');
    expect(host.querySelector('.audio-file-table')?.textContent).toContain('เพลงเก่า');
  });
});
