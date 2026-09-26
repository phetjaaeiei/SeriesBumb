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
