/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useEffect, useState } from 'react';
import ImageUpload from './ImageUpload';
import { imageUrl } from '../../lib/urls';
import { PROVINCES, PROVINCE_NAMES, REGIONS } from '../../lib/provinces';

type Kind = 'tapes' | 'songs' | 'artists' | 'labels' | 'genres' | 'collections';
type LookupKind = 'artists' | 'labels' | 'genres' | 'songs' | 'tapes';
type Row = Record<string, string | number | null>;
type Choice = { id: string; label: string };
type Track = { songId: string; side: 'A' | 'B' | 'C' | 'D'; position: number; durationSec?: number | null; note?: string | null };
type Member = { name: string; role?: string; years?: string | null; isCurrent?: boolean | number };
type Item = { tapeId: string; note?: string | null };
type TapeImage = { id: string; kind: 'front' | 'back' | 'inside' | 'cassette' | 'other'; fullKey: string; thumbKey: string; position: number };
const PROVINCES_BY_REGION = REGIONS.map(region => ({ region, provinces: PROVINCES.filter(province => province.region === region).map(province => province.name) }));
interface Props {
  kind: Kind;
  record: Row;
  artistIds: string[];
  genreIds: string[];
  tracks: Track[];
  members: Member[];
  items: Item[];
  images: TapeImage[];
  selected: Choice[];
  imageBase: string;
}

function Picker({ kind, label, ids, selected, onChange, multiple = true }: { kind: LookupKind; label: string; ids: string[]; selected: Choice[]; onChange: (ids: string[], choice?: Choice) => void; multiple?: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if ([...query.trim()].length < 2) { setResults([]); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      const response = await actions.admin.lookup({ kind, query: query.trim() });
      if (active) { setResults(response.data || []); setError(response.error?.message || ''); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [kind, query]);

  async function create() {
    if (!query.trim()) return;
    setBusy(true); setError('');
    try {
      const name = query.trim();
      const response = kind === 'artists' ? await actions.admin.artists.create({ name })
        : kind === 'labels' ? await actions.admin.labels.create({ name })
        : kind === 'genres' ? await actions.admin.genres.create({ name })
        : kind === 'songs' ? await actions.admin.songs.create({ title: name })
        : await actions.admin.tapes.createDraft({ title: name });
      if (response.error || !response.data) throw new Error(response.error?.message || 'สร้างรายการไม่สำเร็จ');
      const choice = { id: response.data.id, label: name };
      onChange(multiple ? [...ids, choice.id] : [choice.id], choice);
      setQuery(''); setResults([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'สร้างรายการไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  return <div className="admin-picker">
    <span className="admin-label">{label}</span>
    {ids.length > 0 && <div className="picker-values">{ids.map((id, index) => <span className="picker-chip" key={id}>
      {selected.find(choice => choice.id === id)?.label || id}
      <button type="button" aria-label={`เอา ${selected.find(choice => choice.id === id)?.label || id} ออก`} onClick={() => onChange(ids.filter(value => value !== id))}>×</button>
      {multiple && index > 0 && <button type="button" aria-label="เลื่อนขึ้น" onClick={() => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>↑</button>}
    </span>)}</div>}
    <input className="field" value={query} onChange={event => setQuery(event.target.value)} placeholder={`ค้นหา${label}อย่างน้อย 2 ตัวอักษร`} aria-label={`ค้นหา${label}`} />
    {query.length >= 2 && <div className="picker-results">
      {results.filter(row => !ids.includes(row.id)).map(row => <button type="button" key={row.id} onClick={() => { onChange(multiple ? [...ids, row.id] : [row.id], row); setQuery(''); }}>{row.label}</button>)}
      <button type="button" onClick={() => void create()} disabled={busy}>+ สร้าง “{query.trim()}” ใหม่</button>
    </div>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}

function Field({ label, value, onChange, type = 'text', maxLength, help, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; maxLength?: number; help?: string; required?: boolean }) {
  return <label className="admin-field"><span>{label}</span><input className="field" type={type} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} required={required} />{help && <small className="help-text">{help}</small>}</label>;
}

function Area({ label, value, onChange, maxLength = 5000 }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
  return <label className="admin-field admin-field-full"><span>{label}</span><textarea className="field" rows={5} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} /><small className="help-text">{value.length.toLocaleString('th-TH')} / {maxLength.toLocaleString('th-TH')}</small></label>;
}

export default function AdminEditor({ kind, record, artistIds, genreIds, tracks, members, items, images, selected, imageBase }: Props) {
  const [fields, setFields] = useState<Row>(record);
  const [artists, setArtists] = useState(artistIds);
  const [genres, setGenres] = useState(genreIds);
  const [trackRows, setTrackRows] = useState<Track[]>(tracks);
  const [memberRows, setMemberRows] = useState<Member[]>(members);
  const [itemRows, setItemRows] = useState<Item[]>(items);
  const [imageRows, setImageRows] = useState<TapeImage[]>(images);
  const [choices, setChoices] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const id = String(record.id);
  const get = (key: string) => String(fields[key] ?? '');
  const set = (key: string, value: string | number | null) => setFields(previous => ({ ...previous, [key]: value }));
  const choose = (ids: string[], choice: Choice | undefined, setter: (ids: string[]) => void) => { setter(ids); if (choice) setChoices(previous => [...previous.filter(item => item.id !== choice.id), choice]); };
  const publicPath = kind === 'genres' ? `/genres/${get('slug')}` : `/${kind}/${get('slug')}`;

  async function save(status?: 'draft' | 'published') {
    setBusy(true); setMessage(''); setError('');
    try {
      if (!get(kind === 'artists' || kind === 'labels' || kind === 'genres' ? 'name' : 'title').trim()) throw new Error('กรุณากรอกชื่อก่อนบันทึก');
      if (kind === 'tapes') {
        if (trackRows.some(track => !track.songId)) throw new Error('กรุณาเลือกเพลงให้ครบทุกแถว');
        if (status === 'published') {
          if (!imageRows.length) throw new Error('กรุณาเพิ่มรูปปกก่อนเผยแพร่');
          if (!artists.length && !['compilation', 'soundtrack'].includes(get('releaseType'))) throw new Error('กรุณาเลือกศิลปินก่อนเผยแพร่');
        }
      }
      if (kind === 'collections' && itemRows.some(item => !item.tapeId)) throw new Error('กรุณาเลือกเทปให้ครบทุกแถว');
      if (kind === 'artists' && memberRows.some(member => !member.name.trim())) throw new Error('กรุณากรอกชื่อสมาชิกให้ครบทุกแถว');
      const customSlug = get('slug') !== String(record.slug) ? get('slug') : undefined;
      const response = kind === 'tapes' ? await actions.admin.tapes.save({
        id, title: get('title'), titleAlt: get('titleAlt') || null, slug: customSlug,
        year: get('year') ? Number(get('year')) : null,
        releaseType: get('releaseType') as 'album' | 'compilation' | 'soundtrack' | 'single' | 'other',
        catalogNo: get('catalogNo') || null, description: get('description'), reelUrl: get('reelUrl') || null,
        isRare: Boolean(fields.isRare), labelId: get('labelId') || null, artistIds: artists, genreIds: genres,
        tracks: trackRows.map(track => ({ ...track, position: trackRows.filter(row => row.side === track.side).findIndex(row => row === track) + 1, durationSec: track.durationSec || null })),
        status: status || (get('status') as 'draft' | 'published'),
      }) : kind === 'songs' ? await actions.admin.songs.save({
        id, title: get('title'), titleAlt: get('titleAlt') || null, slug: customSlug, artistIds: artists,
        lyricist: get('lyricist') || null, composer: get('composer') || null, arranger: get('arranger') || null,
        lyrics: get('lyrics') || null, notes: get('notes') || null,
      }) : kind === 'artists' ? await actions.admin.artists.save({
        id, name: get('name'), nameAlt: get('nameAlt') || null, slug: customSlug,
        artistType: (get('artistType') || null) as 'band' | 'solo' | 'group' | null,
        status: get('status') as 'active' | 'inactive' | 'hiatus' | 'deceased' | 'unknown',
        province: (get('province') || null) as (typeof PROVINCE_NAMES)[number] | null, yearsActive: get('yearsActive') || null, bio: get('bio'), imageKey: get('imageKey') || null,
        members: memberRows.map(member => ({ name: member.name, role: member.role || '', years: member.years || null, isCurrent: Boolean(member.isCurrent) })),
      }) : kind === 'labels' ? await actions.admin.labels.save({
        id, name: get('name'), nameAlt: get('nameAlt') || null, slug: customSlug, description: get('description'), logoKey: get('logoKey') || null,
      }) : kind === 'genres' ? await actions.admin.genres.save({ id, name: get('name'), slug: customSlug, position: Number(get('position')) })
        : await actions.admin.collections.save({
          id, title: get('title'), slug: customSlug, description: get('description'), coverKey: get('coverKey') || null,
          isFeatured: Boolean(fields.isFeatured), status: status || (get('status') as 'draft' | 'published'), items: itemRows,
        });
      if (response.error || !response.data) throw new Error(response.error?.message || 'บันทึกไม่สำเร็จ');
      const newSlug = response.data.slug;
      set('slug', newSlug);
      if (status) set('status', status);
      setMessage('บันทึกแล้ว');
      if (newSlug !== record.slug) window.history.replaceState(null, '', `/admin/${kind}/${id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ ลองอีกครั้ง'); }
    finally { setBusy(false); }
  }

  async function removeImage(imageId: string) {
    if (!window.confirm('ลบรูปนี้ออกจากเทป?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await actions.admin.images.deleteTapeImage({ imageId });
      if (response.error) throw new Error(response.error.message);
      setImageRows(previous => previous.filter(image => image.id !== imageId));
      setMessage('ลบรูปแล้ว');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ลบรูปไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  async function removeEntity() {
    const label = get(kind === 'artists' || kind === 'labels' || kind === 'genres' ? 'name' : 'title');
    const confirmation = kind === 'tapes' ? window.prompt(`พิมพ์ชื่อ “${label}” เพื่อยืนยันการลบ`) : undefined;
    if (kind === 'tapes' && confirmation !== label) return;
    if (kind !== 'tapes' && !window.confirm(`ลบ ${label} ออกจากคลัง?`)) return;
    setBusy(true); setError('');
    try {
      const response = await actions.admin.deleteCatalog({ kind, id, confirmation: confirmation || undefined });
      if (response.error) throw new Error(response.error.message);
      window.location.assign(`/admin/${kind}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ลบรายการไม่สำเร็จ'); setBusy(false); }
  }

  return <div className="admin-editor">
    <div className="editor-toolbar"><span className="mono muted">ID {id}</span><a className="button" href={publicPath} target="_blank" rel="noreferrer">ดูตัวอย่าง ↗</a></div>
    <div className="editor-section"><h2>ข้อมูลพื้นฐาน</h2><div className="admin-form-grid">
      {(kind === 'artists' || kind === 'labels' || kind === 'genres') ? <Field label="ชื่อ" value={get('name')} onChange={value => set('name', value)} maxLength={200} required /> : <Field label={kind === 'songs' ? 'ชื่อเพลง' : kind === 'tapes' ? 'ชื่อชุดเทป' : 'ชื่อ Collection'} value={get('title')} onChange={value => set('title', value)} maxLength={200} required />}
      {kind !== 'genres' && <Field label="ชื่อรอง / ภาษาอังกฤษ" value={get('nameAlt') || get('titleAlt')} onChange={value => set(kind === 'artists' || kind === 'labels' ? 'nameAlt' : 'titleAlt', value)} maxLength={200} />}
      <Field label="Slug" value={get('slug')} onChange={value => set('slug', value)} maxLength={80} help="หากเปลี่ยน slug ลิงก์เดิมจะ redirect มาที่ใหม่" />
      {kind === 'tapes' && <><Field label="ปีที่ออก (พ.ศ. หรือ ค.ศ.)" type="number" value={get('year')} onChange={value => set('year', value)} /><label className="admin-field"><span>ประเภทเทป</span><select className="field" value={get('releaseType')} onChange={event => set('releaseType', event.target.value)}><option value="album">อัลบั้ม</option><option value="compilation">รวมศิลปิน</option><option value="soundtrack">เพลงประกอบ</option><option value="single">ซิงเกิล</option><option value="other">อื่น ๆ</option></select></label><Field label="รหัสแคตตาล็อก" value={get('catalogNo')} onChange={value => set('catalogNo', value)} maxLength={50} /><Field label="ลิงก์รีวิว Facebook" type="url" value={get('reelUrl')} onChange={value => set('reelUrl', value)} /></>}
      {kind === 'artists' && <><label className="admin-field"><span>ประเภทศิลปิน</span><select className="field" value={get('artistType')} onChange={event => set('artistType', event.target.value)}><option value="">ไม่ระบุ</option><option value="band">วงดนตรี</option><option value="solo">ศิลปินเดี่ยว</option><option value="group">กลุ่ม / ดูโอ</option></select></label><label className="admin-field"><span>สถานะ</span><select className="field" value={get('status')} onChange={event => set('status', event.target.value)}><option value="unknown">ไม่ทราบ</option><option value="active">ยังทำงาน</option><option value="inactive">เลิกทำงาน</option><option value="hiatus">พักวง</option><option value="deceased">เสียชีวิต</option></select></label><label className="admin-field"><span>จังหวัด</span><select className="field" value={get('province')} onChange={event => set('province', event.target.value)}><option value="">ไม่ระบุ</option>{PROVINCES_BY_REGION.map(region => <optgroup key={region.region} label={region.region}>{region.provinces.map(province => <option key={province} value={province}>{province}</option>)}</optgroup>)}</select></label><Field label="ช่วงปีที่ทำงาน" value={get('yearsActive')} onChange={value => set('yearsActive', value)} maxLength={100} /></>}
      {kind === 'songs' && <><Field label="คำร้อง" value={get('lyricist')} onChange={value => set('lyricist', value)} maxLength={200} /><Field label="ทำนอง" value={get('composer')} onChange={value => set('composer', value)} maxLength={200} /><Field label="เรียบเรียง" value={get('arranger')} onChange={value => set('arranger', value)} maxLength={200} /><Area label="เนื้อเพลง" value={get('lyrics')} onChange={value => set('lyrics', value)} maxLength={10000} /><Area label="บันทึก" value={get('notes')} onChange={value => set('notes', value)} maxLength={1000} /></>}
      {kind === 'tapes' && <label className="admin-check"><input type="checkbox" checked={Boolean(fields.isRare)} onChange={event => set('isRare', Number(event.target.checked))} /> เทปหายาก</label>}
      {kind === 'collections' && <label className="admin-check"><input type="checkbox" checked={Boolean(fields.isFeatured)} onChange={event => set('isFeatured', Number(event.target.checked))} /> แสดงเป็น Collection เด่น</label>}
      {kind !== 'genres' && kind !== 'songs' && <Area label={kind === 'artists' ? 'ประวัติ' : 'รายละเอียด'} value={get(kind === 'artists' ? 'bio' : 'description')} onChange={value => set(kind === 'artists' ? 'bio' : 'description', value)} />}
    </div></div>

    {(kind === 'tapes' || kind === 'songs') && <div className="editor-section"><h2>ศิลปินและหมวดหมู่</h2><Picker kind="artists" label={kind === 'songs' ? 'ผู้ร้อง' : 'ศิลปิน'} ids={artists} selected={choices} onChange={(ids, choice) => choose(ids, choice, setArtists)} />{kind === 'tapes' && <><Picker kind="labels" label="ค่ายเพลง" ids={get('labelId') ? [get('labelId')] : []} selected={choices} multiple={false} onChange={(ids, choice) => { set('labelId', ids[0] || ''); if (choice) setChoices(previous => [...previous, choice]); }} /><Picker kind="genres" label="แนวเพลง" ids={genres} selected={choices} onChange={(ids, choice) => choose(ids, choice, setGenres)} /></>}</div>}

    {kind === 'artists' && <div className="editor-section"><h2>สมาชิกวง</h2>{memberRows.map((member, index) => <div className="editor-row" key={index}><input className="field" aria-label={`ชื่อสมาชิก ${index + 1}`} placeholder="ชื่อสมาชิก" value={member.name} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /><input className="field" aria-label={`หน้าที่สมาชิก ${index + 1}`} placeholder="หน้าที่" value={member.role || ''} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, role: event.target.value } : row))} /><input className="field" aria-label={`ปีที่อยู่ในวงของสมาชิก ${index + 1}`} placeholder="ปีที่อยู่ในวง" value={member.years || ''} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, years: event.target.value } : row))} /><label className="admin-check"><input type="checkbox" checked={Boolean(member.isCurrent)} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, isCurrent: event.target.checked } : row))} /> ปัจจุบัน</label><button className="button" type="button" onClick={() => setMemberRows(previous => previous.filter((_, i) => i !== index))}>เอาออก</button></div>)}<button className="button" type="button" onClick={() => setMemberRows(previous => [...previous, { name: '', role: '', years: '', isCurrent: true }])}>+ เพิ่มสมาชิก</button></div>}

    {kind === 'tapes' && <div className="editor-section"><h2>เพลงในเทป</h2>{trackRows.map((track, index) => <div className="track-edit" key={index}><div className="track-edit-top"><select className="field" aria-label={`หน้าเทปเพลง ${index + 1}`} value={track.side} onChange={event => setTrackRows(previous => previous.map((row, i) => i === index ? { ...row, side: event.target.value as Track['side'] } : row))}><option>A</option><option>B</option><option>C</option><option>D</option></select><span>#{index + 1}</span><button type="button" className="button" onClick={() => setTrackRows(previous => previous.filter((_, i) => i !== index))}>เอาออก</button></div><Picker kind="songs" label="เพลง" ids={track.songId ? [track.songId] : []} selected={choices} multiple={false} onChange={(ids, choice) => { setTrackRows(previous => previous.map((row, i) => i === index ? { ...row, songId: ids[0] || '' } : row)); if (choice) setChoices(previous => [...previous, choice]); }} /><div className="admin-form-grid"><Field label="ความยาว (วินาที)" type="number" value={String(track.durationSec || '')} onChange={value => setTrackRows(previous => previous.map((row, i) => i === index ? { ...row, durationSec: value ? Number(value) : null } : row))} /><Field label="โน้ต" value={track.note || ''} onChange={value => setTrackRows(previous => previous.map((row, i) => i === index ? { ...row, note: value } : row))} maxLength={50} /></div></div>)}<button className="button" type="button" onClick={() => setTrackRows(previous => [...previous, { songId: '', side: 'A', position: previous.length + 1, durationSec: null, note: null }])}>+ เพิ่มเพลง</button></div>}

    {kind === 'collections' && <div className="editor-section"><h2>เทปใน Collection</h2>{itemRows.map((item, index) => <div className="track-edit" key={index}><Picker kind="tapes" label={`เทปลำดับ ${index + 1}`} ids={item.tapeId ? [item.tapeId] : []} selected={choices} multiple={false} onChange={(ids, choice) => { setItemRows(previous => previous.map((row, i) => i === index ? { ...row, tapeId: ids[0] || '' } : row)); if (choice) setChoices(previous => [...previous, choice]); }} /><Field label="โน้ต" value={item.note || ''} onChange={value => setItemRows(previous => previous.map((row, i) => i === index ? { ...row, note: value } : row))} maxLength={1000} /><button className="button" type="button" onClick={() => setItemRows(previous => previous.filter((_, i) => i !== index))}>เอาออก</button></div>)}<button className="button" type="button" onClick={() => setItemRows(previous => [...previous, { tapeId: '', note: '' }])}>+ เพิ่มเทป</button></div>}

    {['tapes', 'artists', 'labels', 'collections'].includes(kind) && <div className="editor-section"><h2>รูปภาพ</h2>{kind === 'tapes' && <div className="admin-image-grid">{imageRows.map(image => <div className="admin-image" key={image.id}>{imageBase ? <img src={imageUrl(image.thumbKey, imageBase)} alt={`รูป ${image.kind}`} /> : <span className="muted">{image.kind}</span>}<span>{image.kind}</span><button className="button" type="button" disabled={busy} onClick={() => void removeImage(image.id)}>ลบรูป</button></div>)}</div>}{kind !== 'tapes' && get(kind === 'artists' ? 'imageKey' : kind === 'labels' ? 'logoKey' : 'coverKey') && imageBase && <div className="admin-image"><img src={imageUrl(get(kind === 'artists' ? 'imageKey' : kind === 'labels' ? 'logoKey' : 'coverKey'), imageBase)} alt="รูปปัจจุบัน" /></div>}<ImageUpload entityType={kind as 'tapes' | 'artists' | 'labels' | 'collections'} entityId={id} onUploaded={result => { if (kind === 'tapes') setImageRows(previous => [...previous, { id: result.imageId || result.key, kind: 'front', fullKey: result.key, thumbKey: result.thumbKey || result.key, position: previous.length }]); else set(kind === 'artists' ? 'imageKey' : kind === 'labels' ? 'logoKey' : 'coverKey', result.key); }} /></div>}

    <div className="editor-actions">
      {kind === 'tapes' || kind === 'collections' ? <><button className="button" type="button" disabled={busy} onClick={() => void save('draft')}>บันทึกร่าง</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void save(get('status') === 'published' ? 'draft' : 'published')}>{busy ? 'กำลังบันทึก…' : get('status') === 'published' ? 'ยกเลิกเผยแพร่' : 'เผยแพร่'}</button></> : <button className="button button-primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>}
      <button className="button button-danger" type="button" disabled={busy} onClick={() => void removeEntity()}>ลบรายการ</button>
      {message && <span className="success-text" role="status">{message}</span>}
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  </div>;
}
