/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminEditor from '../../src/components/admin/AdminEditor';

const calls = vi.hoisted(() => ({
  createArtist: vi.fn(), saveArtist: vi.fn(), createTape: vi.fn(), saveTape: vi.fn(), uploadImage: vi.fn(),
}));
vi.mock('astro:actions', () => ({
  actions: { admin: {
    artists: { create: calls.createArtist, save: calls.saveArtist },
    tapes: { createDraft: calls.createTape, save: calls.saveTape },
    images: { upload: calls.uploadImage },
  } },
}));
vi.mock('../../src/client/image-resize', () => ({
  resizeImage: vi.fn(async (file: File) => ({ file, width: 100, height: 100 })),
}));

const base = { artistIds: [], genreIds: [], tracks: [], members: [], items: [], images: [], selected: [], imageBase: '' };

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  for (const mock of Object.values(calls)) mock.mockReset();
});

function mount(kind: 'artists' | 'tapes', record: Record<string, string | number | null>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  return { host, root, view: React.createElement(AdminEditor, { ...base, kind, record }) };
}

describe('admin full create form', () => {
  it('creates on first save and retries a failed full save without creating a second artist', async () => {
    const { host, root, view } = mount('artists', { id: '', name: 'ศิลปินใหม่', slug: '', status: 'unknown' });
    const id = crypto.randomUUID();
    calls.createArtist.mockResolvedValue({ data: { id, slug: 'ศิลปินใหม่' } });
    calls.saveArtist.mockResolvedValueOnce({ error: { message: 'บันทึกรายละเอียดไม่สำเร็จ' } })
      .mockResolvedValueOnce({ data: { id, slug: 'ศิลปินใหม่' } });
    await act(async () => root.render(view));
    expect(calls.createArtist).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('ID ');

    const save = [...host.querySelectorAll('button')].find(button => button.textContent === 'บันทึก')!;
    await act(async () => save.click());
    expect(calls.createArtist).toHaveBeenCalledTimes(1);
    expect(calls.saveArtist).toHaveBeenCalledWith(expect.objectContaining({ id, name: 'ศิลปินใหม่' }));
    expect(window.location.pathname).toBe(`/admin/artists/${id}`);
    expect(host.textContent).toContain('บันทึกรายละเอียดไม่สำเร็จ');

    await act(async () => save.click());
    expect(calls.createArtist).toHaveBeenCalledTimes(1);
    expect(calls.saveArtist).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('บันทึกแล้ว');
    root.unmount();
  });

  it('creates an unnamed tape draft before the first image upload, then reuses it after an upload error', async () => {
    const { host, root, view } = mount('tapes', { id: '', title: '', slug: '', releaseType: 'album', status: 'draft' });
    const id = crypto.randomUUID();
    const imageId = crypto.randomUUID();
    calls.createTape.mockResolvedValue({ data: { id, slug: `draft-${id.slice(0, 8)}` } });
    calls.uploadImage.mockResolvedValueOnce({ error: { message: 'อัปโหลดไม่สำเร็จ' } })
      .mockResolvedValueOnce({ data: { uuid: imageId, key: `tapes/${id}/${imageId}-full.webp` } })
      .mockResolvedValueOnce({ data: { imageId, fullKey: `tapes/${id}/${imageId}-full.webp`, thumbKey: `tapes/${id}/${imageId}-thumb.webp` } });
    await act(async () => root.render(view));
    expect(calls.createTape).not.toHaveBeenCalled();
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'image.webp', { type: 'image/webp' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(calls.createTape).toHaveBeenCalledTimes(1);
    expect(calls.uploadImage).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`/admin/tapes/${id}`);

    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(calls.createTape).toHaveBeenCalledTimes(1);
    expect(calls.uploadImage).toHaveBeenCalledTimes(3);
    expect(calls.uploadImage.mock.invocationCallOrder[0]).toBeGreaterThan(calls.createTape.mock.invocationCallOrder[0]);
    expect(host.querySelectorAll('.admin-tape-image')).toHaveLength(1);
    root.unmount();
  });

  it('blocks image uploads while the tape form is saving', async () => {
    const id = crypto.randomUUID();
    const { host, root, view } = mount('tapes', { id, title: 'เทปทดสอบ', slug: 'เทปทดสอบ', releaseType: 'album', status: 'draft' });
    let finishSave!: (result: unknown) => void;
    calls.saveTape.mockReturnValue(new Promise(resolve => { finishSave = resolve; }));
    await act(async () => root.render(view));

    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const save = [...host.querySelectorAll('button')].find(button => button.textContent === 'บันทึกร่าง')!;
    await act(async () => { save.click(); await Promise.resolve(); });
    expect(input.disabled).toBe(true);

    await act(async () => finishSave({ data: { id, slug: 'เทปทดสอบ', status: 'draft' } }));
    root.unmount();
  });
});
