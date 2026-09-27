/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';

type Person = { id: string; name: string; slug: string };
type Member = { id: string; name: string; role: string; personId: string | null; sourceId: string | null };
type Source = { id: string; title: string };

export default function PeopleManager({ initialPeople, initialMembers, sources, artistId }: { initialPeople: Person[]; initialMembers: Member[]; sources: Source[]; artistId: string | null }) {
  const [people, setPeople] = useState(initialPeople);
  const [members, setMembers] = useState(initialMembers);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function create(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = await actions.admin.people.create({ name });
    if (result.error || !result.data) setMessage(result.error?.message || 'สร้างบุคคลไม่สำเร็จ');
    else { setPeople(rows => [...rows, result.data].sort((a, b) => a.name.localeCompare(b.name, 'th'))); setName(''); setMessage('สร้างบุคคลแล้ว เลือกเชื่อมกับสมาชิกวงด้านล่าง'); }
    setBusy(false);
  }
  async function link(member: Member, personId: string | null, sourceId: string | null) {
    setBusy(true); setMessage('');
    const result = await actions.admin.people.link({ memberId: member.id, personId, sourceId });
    if (result.error) setMessage(result.error.message);
    else { setMembers(rows => rows.map(row => row.id === member.id ? { ...row, personId, sourceId } : row)); setMessage(personId ? 'เชื่อมตัวตนแล้ว' : 'ยกเลิกการเชื่อมแล้ว'); }
    setBusy(false);
  }
  return <div className="section">
    <form className="search-page-form" onSubmit={event => void create(event)}><label className="sr-only" htmlFor="person-name">ชื่อบุคคลใหม่</label><input className="field" id="person-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="ชื่อบุคคลใหม่" disabled={busy} /><button className="button button-primary" disabled={busy}>เพิ่มบุคคล</button></form>
    {message && <p role="status" className="help-text">{message}</p>}
    {artistId && (sources.length ? <p className="help-text">เลือกแหล่งอ้างอิงของศิลปินก่อนเชื่อมบุคคลชื่อเดียวกันเข้าด้วยกัน</p> : <p className="help-text">เพิ่มแหล่งอ้างอิงของศิลปินก่อนเชื่อมบุคคล <a href={`/admin/sources?kind=artist&id=${artistId}`}>เพิ่มแหล่งอ้างอิง</a></p>)}
    {members.length > 0 && <ul className="plain-list section">{members.map(member => <li key={member.id} className="section"><strong>{member.name}</strong> <span className="soft">{member.role}</span><div className="admin-form-grid"><label className="admin-field">บุคคล<select className="field" aria-label={`บุคคลของ ${member.name}`} value={member.personId || ''} disabled={busy || !sources.length} onChange={event => {
      const personId = event.target.value || null;
      if (!personId) void link(member, null, null);
      else setMembers(rows => rows.map(row => row.id === member.id ? { ...row, personId } : row));
    }}><option value="">ยังไม่เชื่อม</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="admin-field">หลักฐาน<select className="field" aria-label={`หลักฐานของ ${member.name}`} value={member.sourceId || ''} disabled={busy || !sources.length} onChange={event => setMembers(rows => rows.map(row => row.id === member.id ? { ...row, sourceId: event.target.value || null } : row))}><option value="">เลือกแหล่งอ้างอิง</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><button className="button" type="button" disabled={busy || !member.personId || !member.sourceId} onClick={() => void link(member, member.personId, member.sourceId)}>บันทึกการเชื่อม</button></div></li>)}</ul>}
    <h2>บุคคลในคลัง</h2>{people.length ? <ul className="browse-list">{people.map(person => <li key={person.id}><a href={`/people/${encodeURIComponent(person.slug)}`}>{person.name}</a></li>)}</ul> : <p className="empty-state">ยังไม่มีบุคคลที่ยืนยันตัวตน</p>}
  </div>;
}
