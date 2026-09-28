/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';
import { TurnstileField } from './TurnstileField';

type Kind = 'artist' | 'tape' | 'song';
export function CorrectionForm({ targetKind, targetId, authenticated, loginNext, turnstileSiteKey = null }: { targetKind: Kind; targetId: string; authenticated: boolean; loginNext: string; turnstileSiteKey?: string | null }) {
  const [body, setBody] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!authenticated) return <p className="soft">พบข้อมูลที่ควรแก้? <a href={`/login?next=${encodeURIComponent(loginNext)}`}>เข้าสู่ระบบเพื่อเสนอแก้</a></p>;
  return <form className="contribution-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = await actions.reviews.correct({ targetKind, targetId, proposedChange: body, sourceUrl: sourceUrl || undefined, turnstileToken: token ?? undefined });
    setMessage(result.error?.message || 'ส่งข้อเสนอแล้ว แอดมินจะตรวจสอบก่อนแก้ข้อมูล');
    if (!result.error) { setBody(''); setSourceUrl(''); }
    setAttempt(value => value + 1);
    setBusy(false);
  }}>
    <label>ข้อมูลที่ควรแก้<textarea className="field" rows={3} value={body} onChange={event => setBody(event.target.value)} minLength={20} maxLength={2000} required disabled={busy} /></label>
    <label>แหล่งอ้างอิง (ถ้ามี)<input className="field" type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} maxLength={2000} placeholder="https://" disabled={busy} /></label>
    <TurnstileField siteKey={turnstileSiteKey} onToken={setToken} resetKey={attempt} />
    <button className="button" disabled={busy || Boolean(turnstileSiteKey && !token)} type="submit">เสนอแก้ข้อมูล</button>
    {message && <p role="status" className="help-text">{message}</p>}
  </form>;
}

export function ReviewForm({ tapeId, authenticated, loginNext, turnstileSiteKey = null }: { tapeId: string; authenticated: boolean; loginNext: string; turnstileSiteKey?: string | null }) {
  const [body, setBody] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!authenticated) return <p className="soft"><a href={`/login?next=${encodeURIComponent(loginNext)}`}>เข้าสู่ระบบเพื่อเขียนรีวิว</a></p>;
  return <form className="contribution-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = await actions.reviews.submit({ tapeId, rating, body, turnstileToken: token ?? undefined });
    setMessage(result.error?.message || 'ส่งรีวิวแล้ว แอดมินจะตรวจก่อนเผยแพร่');
    if (!result.error) setBody('');
    setAttempt(value => value + 1);
    setBusy(false);
  }}>
    <p className="soft">เขียนจากประสบการณ์ฟังหรือสะสมเทป ระบุเหตุผลให้ชัดเจน และเคารพผู้อื่น รีวิวจะขึ้นเว็บหลังแอดมินตรวจ</p>
    <label>คะแนน<select className="field" value={rating} onChange={event => setRating(Number(event.target.value))} disabled={busy}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} ดาว</option>)}</select></label>
    <label>รีวิว<textarea className="field" rows={5} value={body} onChange={event => setBody(event.target.value)} minLength={80} maxLength={3000} required disabled={busy} /></label>
    <TurnstileField siteKey={turnstileSiteKey} onToken={setToken} resetKey={attempt} />
    <button className="button button-primary" disabled={busy || Boolean(turnstileSiteKey && !token)} type="submit">ส่งรีวิวให้ตรวจ</button>
    {message && <p role="status" className="help-text">{message}</p>}
  </form>;
}
