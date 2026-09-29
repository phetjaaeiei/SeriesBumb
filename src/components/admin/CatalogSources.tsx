/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';
import type { CatalogSource, SourceKind } from '../../loaders/admin/sources';

export default function CatalogSources({ entityKind, entityId, initial }: { entityKind: SourceKind; entityId: string; initial: CatalogSource[] }) {
  const [rows, setRows] = useState(initial);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [claim, setClaim] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function add(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = await actions.admin.sources.add({ entityKind, entityId, title, url, claim, accessedAt: Date.now() });
    if (result.error || !result.data) setMessage(result.error?.message || 'บันทึกไม่สำเร็จ');
    else { setRows(previous => [result.data, ...previous]); setTitle(''); setUrl(''); setClaim(''); setMessage('เพิ่มแหล่งอ้างอิงแล้ว'); }
    setBusy(false);
  }
  async function remove(id: string) {
    setBusy(true); setMessage('');
    const result = await actions.admin.sources.delete({ id });
    if (result.error) setMessage(result.error.message);
    else { setRows(previous => previous.filter(row => row.id !== id)); setMessage('ลบแหล่งอ้างอิงแล้ว'); }
    setBusy(false);
  }
  return <div className="section">
    <form onSubmit={event => void add(event)} className="admin-form-grid">
      <label className="admin-field"><span>ชื่อแหล่งข้อมูล</span><input className="field" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required disabled={busy} /></label>
      <label className="admin-field"><span>ลิงก์ https</span><input className="field" type="url" value={url} onChange={event => setUrl(event.target.value)} maxLength={2000} required disabled={busy} /></label>
      <label className="admin-field admin-field-full"><span>ข้อมูลที่แหล่งนี้ยืนยัน</span><textarea className="field" value={claim} onChange={event => setClaim(event.target.value)} maxLength={500} required disabled={busy} rows={3} /></label>
      <button className="button button-primary" type="submit" disabled={busy}>เพิ่มแหล่งอ้างอิง</button>
    </form>
    {message && <p role="status" className="help-text">{message}</p>}
    {rows.length ? <ul className="plain-list section">{rows.map(row => <li key={row.id}><a href={row.url} target="_blank" rel="noopener noreferrer">{row.title} ↗</a> · {row.claim} <button className="button" type="button" disabled={busy} onClick={() => void remove(row.id)}>ลบ</button></li>)}</ul> : <p className="empty-state">ยังไม่มีแหล่งอ้างอิง</p>}
  </div>;
}
