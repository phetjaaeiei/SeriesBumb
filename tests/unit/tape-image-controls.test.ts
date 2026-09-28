/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminEditor from '../../src/components/admin/AdminEditor';

const actionMocks = vi.hoisted(() => ({
  saveTape: vi.fn(),
  uploadImage: vi.fn(),
}));

vi.mock('astro:actions', () => ({
  actions: { admin: { tapes: { save: actionMocks.saveTape }, images: { upload: actionMocks.uploadImage } } },
}));
vi.mock('../../src/client/og-image', () => ({
  createOgImage: vi.fn(async () => new File(['og'], 'og.jpg', { type: 'image/jpeg' })),
}));

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  actionMocks.saveTape.mockReset();
  actionMocks.uploadImage.mockReset();
});

describe('admin tape image controls', () => {
  it('makes a selected image the visible main cover and submits its kind and order', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    actionMocks.saveTape.mockResolvedValue({ data: { id: 'tape-id', slug: 'tape', status: 'draft' } });
    actionMocks.uploadImage.mockResolvedValue({ data: { key: 'tapes/tape-id/og-og.jpg' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['image']), { status: 200 })));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(React.createElement(AdminEditor, {
      kind: 'tapes', record: { id: 'tape-id', title: 'เทปทดสอบ', slug: 'tape', releaseType: 'compilation', status: 'draft' },
      artistIds: [], genreIds: [], tracks: [], members: [], items: [], selected: [], imageBase: '',
      images: [
        { id: firstId, kind: 'front', fullKey: 'front-full.webp', thumbKey: 'front-thumb.webp', position: 0 },
        { id: secondId, kind: 'back', fullKey: 'back-full.webp', thumbKey: 'back-thumb.webp', position: 1 },
      ],
    })));

    const second = host.querySelectorAll('.admin-tape-image')[1];
    const promote = [...second.querySelectorAll('button')].find(button => button.textContent?.includes('ตั้งเป็นปกหลัก'));
    expect(promote).toBeDefined();
    await act(async () => promote!.click());
    expect(host.querySelector('.admin-tape-image')?.textContent).toContain('ปกหลัก');

    const save = [...host.querySelectorAll('button')].find(button => button.textContent === 'บันทึกร่าง');
    await act(async () => save!.click());
    expect(actionMocks.saveTape).toHaveBeenCalledWith(expect.objectContaining({
      images: [{ id: secondId, kind: 'front' }, { id: firstId, kind: 'front' }],
    }));
    root.unmount();
  });
});
