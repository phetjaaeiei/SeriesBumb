/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';

type Kind = 'artist' | 'tape';
type Choice = { id: string; title: string };
type Row = { id: string; targetTitle: string; relationType?: string; format?: string; editionYear?: number | null };

export default function CatalogRelations({ kind, entityId, choices, sources, initial }: { kind: Kind; entityId: string; choices: Choice[]; sources: Choice[]; initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [targetId, setTargetId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [type, setType] = useState(kind === 'artist' ? 'related' : 'cassette');
  const [year, setYear] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function add(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = kind === 'artist'
      ? await actions.admin.relations.addArtist({ artistId: entityId, relatedArtistId: targetId, relationType: type as 'former_name' | 'collaboration' | 'related', sourceId })
      : await actions.admin.relations.addEdition({ tapeId: entityId, relatedTapeId: targetId, format: type as 'cassette' | 'cd' | 'digital' | 'other', editionYear: year ? Number(year) : null, note, sourceId });
    if (result.error || !result.data) setMessage(result.error?.message || 'เชื่อมรายการไม่สำเร็จ');
    else { setRows(previous => [...previous, { id: result.data.id, targetTitle: choices.find(choice => choice.id === targetId)?.title || '', relationType: kind === 'artist' ? type : undefined, format: kind === 'tape' ? type : undefined, editionYear: year ? Number(year) : null }]); setTargetId(''); setMessage('เชื่อมรายการแล้ว'); }
    setBusy(false);
  }
  async function remove(id: string) {
    setBusy(true); setMessage('');
    const result = kind === 'artist' ? await actions.admin.relations.deleteArtist({ id }) : await actions.admin.relations.deleteEdition({ id });
    if (result.error) setMessage(result.error.message);
    else { setRows(previous => previous.filter(row => row.id !== id)); setMessage('ยกเลิกการเชื่อมแล้ว'); }
    setBusy(false);
  }
  return <div className="section">
    {sources.length ? <form className="admin-form-grid" onSubmit={event => void add(event)}>
      <label className="admin-field">รายการที่เกี่ยวข้อง<select className="field" value={targetId} onChange={event => setTargetId(event.target.value)} required disabled={busy}><option value="">เลือกรายการ</option>{choices.filter(choice => choice.id !== entityId).map(choice => <option key={choice.id} value={choice.id}>{choice.title}</option>)}</select></label>
      <label className="admin-field">ความสัมพันธ์<select className="field" value={type} onChange={event => setType(event.target.value)} disabled={busy}>{(kind === 'artist' ? [['related', 'เกี่ยวข้อง'], ['former_name', 'ชื่อเดิม'], ['collaboration', 'ร่วมงาน']] : [['cassette', 'เทป'], ['cd', 'ซีดี'], ['digital', 'ดิจิทัล'], ['other', 'อื่น ๆ']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="admin-field">แหล่งอ้างอิง<select className="field" value={sourceId} onChange={event => setSourceId(event.target.value)} required disabled={busy}><option value="">เลือกหลักฐาน</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
      {kind === 'tape' && <><label className="admin-field">ปีที่ออกของฉบับนี้ (ค.ศ.)<input className="field" type="number" min="1900" max="2100" value={year} onChange={event => setYear(event.target.value)} disabled={busy} /></label><label className="admin-field">หมายเหตุ<input className="field" value={note} onChange={event => setNote(event.target.value)} maxLength={300} disabled={busy} /></label></>}
      <button className="button button-primary" type="submit" disabled={busy}>เพิ่มความสัมพันธ์</button>
    </form> : <p className="empty-state">เพิ่มแหล่งอ้างอิงของรายการนี้ก่อนเชื่อมข้อมูล</p>}
    {message && <p role="status" className="help-text">{message}</p>}
    {rows.length ? <ul className="plain-list section">{rows.map(row => <li key={row.id}>{row.targetTitle} · {row.relationType || row.format}{row.editionYear ? ` · ${row.editionYear}` : ''} <button className="button" disabled={busy} onClick={() => void remove(row.id)}>ยกเลิก</button></li>)}</ul> : <p className="empty-state">ยังไม่มีรายการที่เชื่อม</p>}
  </div>;
}
