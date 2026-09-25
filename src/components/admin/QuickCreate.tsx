/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState, type SyntheticEvent } from 'react';

type Kind = 'tapes' | 'songs' | 'artists' | 'labels' | 'genres' | 'collections';
const labels: Record<Kind, { object: string; field: string }> = {
  tapes: { object: 'เทป', field: 'title' },
  songs: { object: 'เพลง', field: 'title' },
  artists: { object: 'ศิลปิน', field: 'name' },
  labels: { object: 'ค่ายเพลง', field: 'name' },
  genres: { object: 'แนวเพลง', field: 'name' },
  collections: { object: 'Collection', field: 'title' },
};

export default function QuickCreate({ kind }: { kind: Kind }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true); setMessage('');
    try {
      const text = value.trim();
      const result = kind === 'tapes' ? await actions.admin.tapes.createDraft({ title: text })
        : kind === 'songs' ? await actions.admin.songs.create({ title: text })
        : kind === 'artists' ? await actions.admin.artists.create({ name: text })
        : kind === 'labels' ? await actions.admin.labels.create({ name: text })
        : kind === 'genres' ? await actions.admin.genres.create({ name: text })
        : await actions.admin.collections.create({ title: text });
      if (result.error || !result.data) throw new Error(result.error?.message || 'บันทึกไม่สำเร็จ');
      if (kind === 'genres') window.location.reload();
      else window.location.assign(`/admin/${kind}/${result.data.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ ลองอีกครั้ง');
      setBusy(false);
    }
  }

  return <form className="quick-create" onSubmit={submit}>
    <label htmlFor={`quick-${kind}`}>ชื่อ{labels[kind].object}</label>
    <div><input className="field" id={`quick-${kind}`} value={value} onChange={event => setValue(event.target.value)} maxLength={200} required placeholder={`กรอกชื่อ${labels[kind].object}`} /><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : `เพิ่ม${labels[kind].object}`}</button></div>
    {message && <p className="error-text" role="alert">{message}</p>}
  </form>;
}
