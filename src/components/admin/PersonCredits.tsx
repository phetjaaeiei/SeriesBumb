/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';

type Choice = { id: string; title: string };
type Credit = { id: string; creditedAs: string; role: string; personName: string; sourceTitle: string };

export default function PersonCredits({ kind, targetId, people, sources, initial }: { kind: 'tape' | 'song'; targetId: string; people: Choice[]; sources: Choice[]; initial: Credit[] }) {
  const [rows, setRows] = useState(initial);
  const [personId, setPersonId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [creditedAs, setCreditedAs] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function add(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = await actions.admin.credits.add({ personId, targetKind: kind, targetId, creditedAs, role, sourceId });
    if (result.error || !result.data) setMessage(result.error?.message || 'บันทึกไม่สำเร็จ');
    else {
      setRows(previous => [...previous, { id: result.data.id, creditedAs, role, personName: people.find(item => item.id === personId)?.title || '', sourceTitle: sources.find(item => item.id === sourceId)?.title || '' }]);
      setCreditedAs(''); setRole(''); setMessage('เพิ่มเครดิตแล้ว');
    }
    setBusy(false);
  }
  async function remove(id: string) {
    setBusy(true); setMessage('');
    const result = await actions.admin.credits.delete({ id });
    if (result.error) setMessage(result.error.message);
    else { setRows(previous => previous.filter(row => row.id !== id)); setMessage('ลบเครดิตแล้ว'); }
    setBusy(false);
  }
  return <div className="section">
    {people.length && sources.length ? <form className="admin-form-grid" onSubmit={event => void add(event)}>
      <label className="admin-field">บุคคล<select className="field" value={personId} onChange={event => setPersonId(event.target.value)} required disabled={busy}><option value="">เลือกบุคคล</option>{people.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <label className="admin-field">ชื่อบนปก<input className="field" value={creditedAs} onChange={event => setCreditedAs(event.target.value)} maxLength={100} required disabled={busy} /></label>
      <label className="admin-field">หน้าที่<input className="field" value={role} onChange={event => setRole(event.target.value)} maxLength={100} required disabled={busy} /></label>
      <label className="admin-field">หลักฐาน<select className="field" value={sourceId} onChange={event => setSourceId(event.target.value)} required disabled={busy}><option value="">เลือกหลักฐาน</option>{sources.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <button className="button button-primary" type="submit" disabled={busy}>เพิ่มเครดิต</button>
    </form> : <p className="empty-state">เพิ่มบุคคลและหลักฐานของรายการนี้ก่อน</p>}
    {message && <p role="status" className="help-text">{message}</p>}
    {rows.length ? <ul className="plain-list section">{rows.map(row => <li key={row.id}>{row.creditedAs} · {row.role} ({row.personName}) · {row.sourceTitle} <button className="button" type="button" disabled={busy} onClick={() => void remove(row.id)}>ลบ</button></li>)}</ul> : <p className="empty-state">ยังไม่มีเครดิตบุคคล</p>}
  </div>;
}
