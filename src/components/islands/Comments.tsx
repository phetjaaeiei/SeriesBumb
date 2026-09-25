/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useEffect, useState, type SyntheticEvent } from 'react';
import type { CommentDto } from '../../lib/services/comments';

interface Props {
  tapeId?: string;
  songId?: string;
  initialItems: CommentDto[];
  initialCursor: string | null;
  initialCount: number;
  authenticated: boolean;
  banned: boolean;
  loginNext: string;
}
const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

export default function Comments({ tapeId, songId, initialItems, initialCursor, initialCount, authenticated, banned, loginNext }: Props) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [count, setCount] = useState(initialCount);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const response = await actions.comments.create({ tapeId, songId, body });
      if (response.error || !response.data) throw new Error(response.error?.message || 'ส่งคอมเมนต์ไม่สำเร็จ');
      setItems(previous => [response.data!, ...previous]);
      setCount(previous => previous + 1);
      setBody('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ส่งคอมเมนต์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm('ลบคอมเมนต์นี้?')) return;
    setBusy(true); setError('');
    try {
      const response = await actions.comments.delete({ id });
      if (response.error) throw new Error(response.error.message);
      setItems(previous => previous.filter(item => item.id !== id));
      setCount(previous => Math.max(0, previous - 1));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ลบคอมเมนต์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true); setError('');
    try {
      const response = await actions.comments.list({ tapeId, songId, cursor });
      if (response.error || !response.data) throw new Error(response.error?.message || 'โหลดคอมเมนต์ไม่สำเร็จ');
      setItems(previous => [...previous, ...response.data!.items]);
      setCursor(response.data.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'โหลดคอมเมนต์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  return <div className="comments"><p className="muted">{count.toLocaleString('th-TH')} คอมเมนต์</p>
    {items.length ? <ol className="comment-list">{items.map(item => <li className="comment" key={item.id}>
      <div className="comment-avatar" aria-hidden="true">{item.author.image ? <img src={item.author.image} alt="" width="36" height="36" referrerPolicy="no-referrer" /> : item.author.name.charAt(0)}</div>
      <div className="comment-content"><div className="comment-meta"><strong>{item.author.name}</strong><time dateTime={new Date(item.createdAt).toISOString()}>{dateFormat.format(item.createdAt)}</time>{item.isMine && <button className="comment-delete" type="button" disabled={busy} onClick={() => void remove(item.id)}>ลบ</button>}</div><p className="comment-body">{item.body}</p></div>
    </li>)}</ol> : <p className="empty-state">ยังไม่มีคอมเมนต์ มาเป็นคนแรกได้เลย</p>}
    {cursor && <button className="button" type="button" disabled={busy} onClick={() => void loadMore()}>{busy ? 'กำลังโหลด…' : 'ดูคอมเมนต์เพิ่ม'}</button>}
    {!authenticated ? <p className="comment-login"><a href={`/login?next=${encodeURIComponent(loginNext)}`}>เข้าสู่ระบบเพื่อคอมเมนต์</a></p>
      : banned ? <p className="error-text">บัญชีนี้ถูกระงับการคอมเมนต์</p>
        : <form className="comment-form" onSubmit={event => void submit(event)}><label htmlFor="comment-body">เขียนคอมเมนต์</label><p className="help-text">ชื่อและรูปโปรไฟล์ Google ของคุณจะแสดงต่อสาธารณะพร้อมคอมเมนต์</p><textarea className="field" id="comment-body" value={body} onChange={event => setBody(event.target.value)} maxLength={3000} rows={4} required disabled={!ready} /><button className="button button-primary" type="submit" disabled={!ready || busy || !body.trim()}>{busy ? 'กำลังส่ง…' : 'ส่งคอมเมนต์'}</button></form>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}
