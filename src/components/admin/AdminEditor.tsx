/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import ImageUpload from './ImageUpload';
import { imageUrl } from '../../lib/urls';
import { PROVINCES, PROVINCE_NAMES, REGIONS } from '../../lib/provinces';
import { createOgImage } from '../../lib/client/og-image';
import { formatDuration, parseDuration } from '../../lib/format';
import { TRACK_SIDES, appendTrack, changeTrackSide, moveTrack, numberTracks, reorderSide, type TrackSide } from '../../lib/client/track-order';
import { offerReauth } from '../../lib/client/reauth';

type Kind = 'tapes' | 'songs' | 'artists' | 'labels' | 'genres' | 'collections';
type LookupKind = 'artists' | 'labels' | 'genres' | 'songs' | 'tapes';
type Row = Record<string, string | number | null>;
type Choice = { id: string; label: string };
type Track = { songId: string; side: TrackSide; position: number; durationSec?: number | null; note?: string | null };
type TrackRow = Track & { clientId: string; durationText: string };
type Member = { id?: string; name: string; role?: string; years?: string | null; isCurrent?: boolean | number };
type Item = { tapeId: string; note?: string | null };
type TapeImage = { id: string; kind: 'front' | 'back' | 'inside' | 'cassette' | 'other'; fullKey: string; thumbKey: string; position: number };
const IMAGE_KIND_LABELS: Record<TapeImage['kind'], string> = { front: 'ปกหน้า', back: 'ปกหลัง', inside: 'ด้านใน', cassette: 'ตลับเทป', other: 'อื่น ๆ' };
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

function TrackItem({ track, index, count, choices, onUpdate, onSideChange, onMove, onRemove, onOrderChanged, onChoice }: {
  track: TrackRow; index: number; count: number; choices: Choice[];
  onUpdate: (values: Partial<TrackRow>) => void;
  onSideChange: (side: TrackSide) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onOrderChanged: () => void;
  onChoice: (choice: Choice) => void;
}) {
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  return <Reorder.Item as="div" value={track.clientId} dragListener={false} dragControls={dragControls} onDragEnd={onOrderChanged} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="track-edit">
    <div className="track-edit-top">
      <button type="button" className="track-drag-handle" aria-label={`เรียงเพลงหน้า ${track.side} ลำดับ ${index + 1} ใช้ลูกศรขึ้นลงหรือจับลาก`} onPointerDown={event => dragControls.start(event)} onKeyDown={event => {
        if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); onMove(-1); }
        if (event.key === 'ArrowDown' && index < count - 1) { event.preventDefault(); onMove(1); }
      }} title="ลากเพื่อเรียงเพลง">⠿</button>
      <select className="field" aria-label={`หน้าเทปเพลงลำดับ ${index + 1}`} value={track.side} onChange={event => onSideChange(event.target.value as TrackSide)}>{TRACK_SIDES.map(side => <option key={side}>{side}</option>)}</select>
      <span className="mono">#{index + 1}</span>
      <div className="track-order-actions">
        <button type="button" className="button" aria-label={`เลื่อนเพลงหน้า ${track.side} ลำดับ ${index + 1} ขึ้น`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="button" aria-label={`เลื่อนเพลงหน้า ${track.side} ลำดับ ${index + 1} ลง`} disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
      </div>
      <button type="button" className="button" onClick={onRemove}>เอาเพลงออก</button>
    </div>
    <Picker kind="songs" label="เพลง" ids={track.songId ? [track.songId] : []} selected={choices} multiple={false} onChange={(ids, choice) => { onUpdate({ songId: ids[0] || '' }); if (choice) onChoice(choice); }} />
    <div className="admin-form-grid">
      <Field label="ความยาว (นาที:วินาที)" value={track.durationText} onChange={value => onUpdate({ durationText: value })} maxLength={5} help="เช่น 4:12" />
      <Field label="โน้ต" value={track.note || ''} onChange={value => onUpdate({ note: value })} maxLength={50} />
    </div>
  </Reorder.Item>;
}

function TapeImageItem({ image, index, count, isCover, canDelete, imageBase, busy, onKindChange, onSetCover, onMove, onRemove, onOrderChanged }: {
  image: TapeImage; index: number; count: number; isCover: boolean; canDelete: boolean; imageBase: string; busy: boolean;
  onKindChange: (kind: TapeImage['kind']) => void;
  onSetCover: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onOrderChanged: () => void;
}) {
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  return <Reorder.Item as="li" value={image.id} dragListener={false} dragControls={dragControls} onDragEnd={onOrderChanged} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="admin-tape-image">
    <div className="admin-tape-image-preview">{imageBase ? <img src={imageUrl(image.thumbKey, imageBase)} alt={`${IMAGE_KIND_LABELS[image.kind]} รูปที่ ${index + 1}`} width="112" height="112" loading="lazy" decoding="async" /> : <span className="muted">{IMAGE_KIND_LABELS[image.kind]}</span>}</div>
    <div className="admin-tape-image-body">
      <div className="admin-tape-image-heading"><span className="mono">รูปที่ {index + 1}</span>{isCover && <span className="admin-cover-badge">ปกหลัก</span>}</div>
      <label className="admin-field">ประเภทภาพ<select className="field" aria-label={`ประเภทภาพรูปที่ ${index + 1}`} value={image.kind} disabled={busy} onChange={event => onKindChange(event.target.value as TapeImage['kind'])}>{Object.entries(IMAGE_KIND_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <div className="admin-tape-image-actions">
        <button type="button" className="track-drag-handle" aria-label={`เรียงรูปที่ ${index + 1} ใช้ลูกศรขึ้นลงหรือจับลาก`} disabled={busy} onPointerDown={event => dragControls.start(event)} onKeyDown={event => {
          if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); onMove(-1); }
          if (event.key === 'ArrowDown' && index < count - 1) { event.preventDefault(); onMove(1); }
        }} title="ลากเพื่อเรียงรูป">⠿</button>
        <button type="button" className="button" aria-label={`เลื่อนรูปที่ ${index + 1} ขึ้น`} disabled={busy || index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="button" aria-label={`เลื่อนรูปที่ ${index + 1} ลง`} disabled={busy || index === count - 1} onClick={() => onMove(1)}>↓</button>
        <button type="button" className="button" aria-label={`ตั้งรูปที่ ${index + 1} เป็นปกหลัก`} disabled={busy || (isCover && image.kind === 'front')} onClick={onSetCover}>ตั้งเป็นปกหลัก</button>
        <button type="button" className="button button-danger" aria-label={`ลบรูปที่ ${index + 1}`} disabled={busy || !canDelete} onClick={onRemove}>ลบรูป</button>
      </div>
    </div>
  </Reorder.Item>;
}

export default function AdminEditor({ kind, record, artistIds, genreIds, tracks, members, items, images, selected, imageBase }: Props) {
  const [fields, setFields] = useState<Row>(record);
  const [id, setId] = useState(String(record.id || ''));
  const idRef = useRef(id);
  const creatingRef = useRef<Promise<string> | null>(null);
  const savingRef = useRef(false);
  const uploadingRef = useRef(false);
  const [savedSlug, setSavedSlug] = useState(String(record.slug || ''));
  const [artists, setArtists] = useState(artistIds);
  const [genres, setGenres] = useState(genreIds);
  const [trackRows, setTrackRows] = useState<TrackRow[]>(() => tracks.map(track => ({ ...track, clientId: crypto.randomUUID(), durationText: formatDuration(track.durationSec ?? null) })));
  const [memberRows, setMemberRows] = useState<Member[]>(members);
  const [itemRows, setItemRows] = useState<Item[]>(items);
  const [imageRows, setImageRows] = useState<TapeImage[]>(images);
  const [imageDirty, setImageDirty] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageAnnouncement, setImageAnnouncement] = useState('');
  const [choices, setChoices] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [trackAnnouncement, setTrackAnnouncement] = useState('');
  const get = (key: string) => String(fields[key] ?? '');
  const set = (key: string, value: string | number | null) => setFields(previous => ({ ...previous, [key]: value }));
  const choose = (ids: string[], choice: Choice | undefined, setter: (ids: string[]) => void) => { setter(ids); if (choice) setChoices(previous => [...previous.filter(item => item.id !== choice.id), choice]); };
  const publicPath = kind === 'genres' ? `/genres/${encodeURIComponent(savedSlug)}` : `/${kind}/${encodeURIComponent(savedSlug)}`;
  const coverImageId = imageRows.find(image => image.kind === 'front')?.id || imageRows[0]?.id;

  async function ensureCreated(): Promise<string> {
    if (idRef.current) return idRef.current;
    if (creatingRef.current) return creatingRef.current;
    const pending = (async () => {
      const name = get(kind === 'artists' || kind === 'labels' || kind === 'genres' ? 'name' : 'title').trim();
      if (!name && kind !== 'tapes') throw new Error('กรุณากรอกชื่อก่อนบันทึก');
      const response = kind === 'tapes' ? await actions.admin.tapes.createDraft({ title: name || undefined })
        : kind === 'songs' ? await actions.admin.songs.create({ title: name, artistIds: artists })
        : kind === 'artists' ? await actions.admin.artists.create({ name })
        : kind === 'labels' ? await actions.admin.labels.create({ name })
        : kind === 'genres' ? await actions.admin.genres.create({ name })
        : await actions.admin.collections.create({ title: name });
      if (response.error || !response.data) throw new Error(response.error?.message || 'สร้างรายการไม่สำเร็จ');
      const nextId = response.data.id;
      idRef.current = nextId;
      setId(nextId);
      setSavedSlug(response.data.slug);
      setFields(previous => previous.slug ? previous : { ...previous, slug: response.data.slug });
      window.history.replaceState(null, '', `/admin/${kind}/${nextId}`);
      return nextId;
    })();
    creatingRef.current = pending;
    try { return await pending; }
    finally { creatingRef.current = null; }
  }

  function moveImage(imageId: string, direction: -1 | 1) {
    const index = imageRows.findIndex(image => image.id === imageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= imageRows.length) return;
    setImageRows(previous => {
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setImageDirty(true);
    setImageAnnouncement(`ย้ายรูปไปที่ลำดับ ${target + 1} แล้ว`);
  }

  function reorderImages(ids: string[]) {
    if (ids.length !== imageRows.length || ids.some(id => !imageRows.some(image => image.id === id))) return;
    setImageRows(previous => ids.map(id => previous.find(image => image.id === id)!));
    setImageDirty(true);
  }

  async function save(status?: 'draft' | 'published') {
    if (savingRef.current || uploadingRef.current) return;
    savingRef.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      if (!get(kind === 'artists' || kind === 'labels' || kind === 'genres' ? 'name' : 'title').trim()) throw new Error('กรุณากรอกชื่อก่อนบันทึก');
      if (kind === 'tapes') {
        if (trackRows.some(track => !track.songId)) throw new Error('กรุณาเลือกเพลงให้ครบทุกแถว');
        if (trackRows.some(track => track.durationText.trim() && parseDuration(track.durationText) === null)) throw new Error('ความยาวเพลงต้องเป็น นาที:วินาที เช่น 4:12');
        if (status === 'published') {
          if (!imageRows.length) throw new Error('กรุณาเพิ่มรูปปกก่อนเผยแพร่');
          if (!artists.length && !['compilation', 'soundtrack'].includes(get('releaseType'))) throw new Error('กรุณาเลือกศิลปินก่อนเผยแพร่');
        }
      }
      if (kind === 'collections' && itemRows.some(item => !item.tapeId)) throw new Error('กรุณาเลือกเทปให้ครบทุกแถว');
      if (kind === 'artists' && memberRows.some(member => !member.name.trim())) throw new Error('กรุณากรอกชื่อสมาชิกให้ครบทุกแถว');
      const id = await ensureCreated();
      const requestedSlug = get('slug').trim();
      const customSlug = requestedSlug && requestedSlug !== savedSlug ? requestedSlug : undefined;
      let nextOgKey: string | null | undefined;
      let nextOgSourceId: string | null | undefined;
      let nextOgSourceTitle: string | null | undefined;
      let ogWarning = '';
      if (kind === 'tapes') {
        const cover = imageRows.find(image => image.kind === 'front') || imageRows[0];
        if (!cover) nextOgKey = null;
        else if (!get('ogImageKey') || cover.id !== get('ogSourceImageId') || get('title') !== get('ogSourceTitle')) {
          try {
            const response = await fetch(`/admin/api/image/${encodeURIComponent(cover.id)}`);
            if (!response.ok) throw new Error('โหลดปกไม่สำเร็จ');
            const generated = await createOgImage(await response.blob(), get('title'));
            const form = new FormData();
            form.set('entityType', 'tapes'); form.set('entityId', id); form.set('variant', 'og'); form.set('file', generated);
            const uploaded = await actions.admin.images.upload(form);
            if (uploaded.error || !uploaded.data) throw new Error(uploaded.error?.message || 'อัปโหลดภาพแชร์ไม่สำเร็จ');
            nextOgKey = uploaded.data.key;
            nextOgSourceId = cover.id;
            nextOgSourceTitle = get('title');
          } catch { nextOgKey = null; nextOgSourceId = null; nextOgSourceTitle = null; ogWarning = 'ภาพแชร์ใช้รูปสำรอง'; }
        }
      }
      const response = kind === 'tapes' ? await actions.admin.tapes.save({
        id, title: get('title'), titleAlt: get('titleAlt') || null, slug: customSlug,
        year: get('year') ? Number(get('year')) : null,
        releaseType: get('releaseType') as 'album' | 'compilation' | 'soundtrack' | 'single' | 'other',
        catalogNo: get('catalogNo') || null, description: get('description'), reelUrl: get('reelUrl') || null,
        isRare: Boolean(fields.isRare), labelId: get('labelId') || null, artistIds: artists, genreIds: genres,
        tracks: numberTracks(trackRows).map(track => ({ songId: track.songId, side: track.side, position: track.position, durationSec: parseDuration(track.durationText), note: track.note || null })),
        images: imageRows.map(image => ({ id: image.id, kind: image.kind })),
        status: status || (get('status') as 'draft' | 'published'), ogImageKey: nextOgKey, ogSourceImageId: nextOgSourceId, ogSourceTitle: nextOgSourceTitle,
      }) : kind === 'songs' ? await actions.admin.songs.save({
        id, title: get('title'), titleAlt: get('titleAlt') || null, slug: customSlug, artistIds: artists,
        isPublic: Boolean(fields.isPublic),
        lyricist: get('lyricist') || null, composer: get('composer') || null, arranger: get('arranger') || null,
        lyrics: get('lyrics') || null, notes: get('notes') || null,
      }) : kind === 'artists' ? await actions.admin.artists.save({
        id, name: get('name'), nameAlt: get('nameAlt') || null, slug: customSlug,
        artistType: (get('artistType') || null) as 'band' | 'solo' | 'group' | null,
        status: get('status') as 'active' | 'inactive' | 'hiatus' | 'deceased' | 'unknown',
        province: (get('province') || null) as (typeof PROVINCE_NAMES)[number] | null, formedYear: get('formedYear') ? Number(get('formedYear')) : null, themes: get('themes') || null, yearsActive: get('yearsActive') || null, bio: get('bio'), imageKey: get('imageKey') || null,
        members: memberRows.map(member => ({ id: member.id, name: member.name, role: member.role || '', years: member.years || null, isCurrent: Boolean(member.isCurrent) })),
      }) : kind === 'labels' ? await actions.admin.labels.save({
        id, name: get('name'), nameAlt: get('nameAlt') || null, slug: customSlug, description: get('description'), logoKey: get('logoKey') || null,
      }) : kind === 'genres' ? await actions.admin.genres.save({ id, name: get('name'), slug: customSlug, position: fields.position == null ? undefined : Number(get('position')) })
        : await actions.admin.collections.save({
          id, title: get('title'), slug: customSlug, description: get('description'), coverKey: get('coverKey') || null,
          isFeatured: Boolean(fields.isFeatured), status: status || (get('status') as 'draft' | 'published'), items: itemRows,
        });
      if (response.error || !response.data) throw new Error(response.error?.message || 'บันทึกไม่สำเร็จ');
      const newSlug = response.data.slug;
      set('slug', newSlug);
      setSavedSlug(newSlug);
      if (status) set('status', status);
      if (kind === 'tapes' && nextOgKey !== undefined) setFields(previous => ({ ...previous, ogImageKey: nextOgKey, ogSourceImageId: nextOgSourceId || null, ogSourceTitle: nextOgSourceTitle || null }));
      if (kind === 'tapes') setImageDirty(false);
      setMessage(ogWarning ? `บันทึกแล้ว · ${ogWarning}` : 'บันทึกแล้ว');
      if (newSlug !== record.slug) window.history.replaceState(null, '', `/admin/${kind}/${id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ ลองอีกครั้ง'); }
    finally { savingRef.current = false; setBusy(false); }
  }

  async function removeImage(imageId: string) {
    if (!window.confirm('ลบรูปนี้ออกจากเทปถาวร? ไฟล์รูปจะถูกลบจากคลังภาพด้วย')) return;
    setBusy(true); setError(''); setMessage(''); setImageError('');
    try {
      const response = await actions.admin.images.deleteTapeImage({ imageId });
      if (response.error) throw new Error(response.error.message);
      setImageRows(previous => previous.filter(image => image.id !== imageId));
      setMessage('ลบรูปแล้ว');
      setImageAnnouncement('ลบรูปแล้ว');
    } catch (cause) { setImageError(cause instanceof Error ? cause.message : 'ลบรูปไม่สำเร็จ'); }
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
    } catch (cause) { const text = cause instanceof Error ? cause.message : 'ลบรายการไม่สำเร็จ'; if (!offerReauth(text)) setError(text); setBusy(false); }
  }

  return <div className="admin-editor">
    <div className="editor-toolbar"><span className="mono muted">{id ? `ID ${id}` : 'รายการใหม่'}</span>{id && savedSlug && <a className="button" href={publicPath} target="_blank" rel="noreferrer">ดูตัวอย่าง ↗</a>}</div>
    <div className="editor-section"><h2>ข้อมูลพื้นฐาน</h2><div className="admin-form-grid">
      {(kind === 'artists' || kind === 'labels' || kind === 'genres') ? <Field label="ชื่อ" value={get('name')} onChange={value => set('name', value)} maxLength={200} required /> : <Field label={kind === 'songs' ? 'ชื่อเพลง' : kind === 'tapes' ? 'ชื่อชุดเทป' : 'ชื่อ Collection'} value={get('title')} onChange={value => set('title', value)} maxLength={200} required />}
      {kind !== 'genres' && <Field label="ชื่อรอง / ภาษาอังกฤษ" value={get('nameAlt') || get('titleAlt')} onChange={value => set(kind === 'artists' || kind === 'labels' ? 'nameAlt' : 'titleAlt', value)} maxLength={200} />}
      <Field label="Slug" value={get('slug')} onChange={value => set('slug', value)} maxLength={80} help={id ? 'หากเปลี่ยน slug ลิงก์เดิมจะ redirect มาที่ใหม่' : 'เว้นว่างเพื่อสร้างลิงก์อัตโนมัติ'} />
      {kind === 'tapes' && <><Field label="ปีที่ออก (พ.ศ. หรือ ค.ศ.)" type="number" value={get('year')} onChange={value => set('year', value)} /><label className="admin-field"><span>ประเภทเทป</span><select className="field" value={get('releaseType')} onChange={event => set('releaseType', event.target.value)}><option value="album">อัลบั้ม</option><option value="compilation">รวมศิลปิน</option><option value="soundtrack">เพลงประกอบ</option><option value="single">ซิงเกิล</option><option value="other">อื่น ๆ</option></select></label><Field label="รหัสแคตตาล็อก" value={get('catalogNo')} onChange={value => set('catalogNo', value)} maxLength={50} /><Field label="ลิงก์รีวิว Facebook" type="url" value={get('reelUrl')} onChange={value => set('reelUrl', value)} /></>}
      {kind === 'artists' && <><label className="admin-field"><span>ประเภทศิลปิน</span><select className="field" value={get('artistType')} onChange={event => set('artistType', event.target.value)}><option value="">ไม่ระบุ</option><option value="band">วงดนตรี</option><option value="solo">ศิลปินเดี่ยว</option><option value="group">กลุ่ม / ดูโอ</option></select></label><label className="admin-field"><span>สถานะ</span><select className="field" value={get('status')} onChange={event => set('status', event.target.value)}><option value="unknown">ไม่ทราบ</option><option value="active">ยังทำงาน</option><option value="inactive">เลิกทำงาน</option><option value="hiatus">พักวง</option><option value="deceased">เสียชีวิต</option></select></label><label className="admin-field"><span>จังหวัด</span><select className="field" value={get('province')} onChange={event => set('province', event.target.value)}><option value="">ไม่ระบุ</option>{PROVINCES_BY_REGION.map(region => <optgroup key={region.region} label={region.region}>{region.provinces.map(province => <option key={province} value={province}>{province}</option>)}</optgroup>)}</select></label><Field label="ปีที่เริ่มทำงาน (พ.ศ. หรือ ค.ศ.)" type="number" value={get('formedYear')} onChange={value => set('formedYear', value)} /><Field label="หัวข้อเพลง / ธีม" value={get('themes')} onChange={value => set('themes', value)} maxLength={300} help="ระบุเฉพาะข้อมูลที่ตรวจสอบแล้ว เช่น ชีวิต ความรัก" /><Field label="ช่วงปีที่ทำงาน" value={get('yearsActive')} onChange={value => set('yearsActive', value)} maxLength={100} /></>}
      {kind === 'songs' && <><Field label="คำร้อง" value={get('lyricist')} onChange={value => set('lyricist', value)} maxLength={200} /><Field label="ทำนอง" value={get('composer')} onChange={value => set('composer', value)} maxLength={200} /><Field label="เรียบเรียง" value={get('arranger')} onChange={value => set('arranger', value)} maxLength={200} /><Area label="เนื้อเพลง" value={get('lyrics')} onChange={value => set('lyrics', value)} maxLength={10000} /><Area label="บันทึก" value={get('notes')} onChange={value => set('notes', value)} maxLength={1000} /></>}
      {kind === 'songs' && <label className="admin-check admin-field-full"><input type="checkbox" checked={Boolean(fields.isPublic)} onChange={event => set('isPublic', Number(event.target.checked))} /> เผยแพร่ข้อมูลเพลงให้ทุกคนเห็น <span className="help-text">ไฟล์เสียงยังเข้าถึงได้เฉพาะแอดมิน</span></label>}
      {kind === 'tapes' && <label className="admin-check"><input type="checkbox" checked={Boolean(fields.isRare)} onChange={event => set('isRare', Number(event.target.checked))} /> เทปหายาก</label>}
      {kind === 'collections' && <label className="admin-check"><input type="checkbox" checked={Boolean(fields.isFeatured)} onChange={event => set('isFeatured', Number(event.target.checked))} /> แสดงเป็น Collection เด่น</label>}
      {kind !== 'genres' && kind !== 'songs' && <Area label={kind === 'artists' ? 'ประวัติ' : 'รายละเอียด'} value={get(kind === 'artists' ? 'bio' : 'description')} onChange={value => set(kind === 'artists' ? 'bio' : 'description', value)} />}
    </div></div>

    {(kind === 'tapes' || kind === 'songs') && <div className="editor-section"><h2>ศิลปินและหมวดหมู่</h2><Picker kind="artists" label={kind === 'songs' ? 'ผู้ร้อง' : 'ศิลปิน'} ids={artists} selected={choices} onChange={(ids, choice) => choose(ids, choice, setArtists)} />{kind === 'tapes' && <><Picker kind="labels" label="ค่ายเพลง" ids={get('labelId') ? [get('labelId')] : []} selected={choices} multiple={false} onChange={(ids, choice) => { set('labelId', ids[0] || ''); if (choice) setChoices(previous => [...previous, choice]); }} /><Picker kind="genres" label="แนวเพลง" ids={genres} selected={choices} onChange={(ids, choice) => choose(ids, choice, setGenres)} /></>}</div>}

    {kind === 'artists' && id && <p><a href={`/admin/people?artistId=${encodeURIComponent(id)}`}>เชื่อมตัวตนสมาชิกวงพร้อมหลักฐาน →</a></p>}
    {kind === 'artists' && <div className="editor-section"><h2>สมาชิกวง</h2>{memberRows.map((member, index) => <div className="editor-row" key={index}><input className="field" aria-label={`ชื่อสมาชิก ${index + 1}`} placeholder="ชื่อสมาชิก" value={member.name} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /><input className="field" aria-label={`หน้าที่สมาชิก ${index + 1}`} placeholder="หน้าที่" value={member.role || ''} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, role: event.target.value } : row))} /><input className="field" aria-label={`ปีที่อยู่ในวงของสมาชิก ${index + 1}`} placeholder="ปีที่อยู่ในวง" value={member.years || ''} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, years: event.target.value } : row))} /><label className="admin-check"><input type="checkbox" checked={Boolean(member.isCurrent)} onChange={event => setMemberRows(previous => previous.map((row, i) => i === index ? { ...row, isCurrent: event.target.checked } : row))} /> ปัจจุบัน</label><button className="button" type="button" onClick={() => setMemberRows(previous => previous.filter((_, i) => i !== index))}>เอาออก</button></div>)}<button className="button" type="button" onClick={() => setMemberRows(previous => [...previous, { name: '', role: '', years: '', isCurrent: true }])}>+ เพิ่มสมาชิก</button></div>}

    {kind === 'tapes' && <div className="editor-section">
      <h2>เพลงในเทป</h2>
      <p className="help-text">ลากที่สัญลักษณ์หรือใช้ปุ่มลูกศรเพื่อเรียงเพลงในแต่ละหน้า บันทึกฟอร์มเพื่อใช้ลำดับใหม่</p>
      <span className="sr-only" aria-live="polite">{trackAnnouncement}</span>
      {TRACK_SIDES.filter(side => side === 'A' || side === 'B' || trackRows.some(track => track.side === side)).map(side => {
        const sideRows = trackRows.filter(track => track.side === side);
        return <section className="admin-track-side" key={side} aria-label={`เพลงหน้า ${side}`}>
          <h3>หน้า {side} <span className="muted mono">({sideRows.length})</span></h3>
          {sideRows.length ? <Reorder.Group as="div" axis="y" values={sideRows.map(track => track.clientId)} onReorder={ids => setTrackRows(previous => reorderSide(previous, side, ids))} className="admin-track-list">
            {sideRows.map((track, index) => <TrackItem key={track.clientId} track={track} index={index} count={sideRows.length} choices={choices}
              onUpdate={values => setTrackRows(previous => previous.map(row => row.clientId === track.clientId ? { ...row, ...values } : row))}
              onSideChange={target => { setTrackRows(previous => changeTrackSide(previous, track.clientId, target)); setTrackAnnouncement(`ย้ายเพลงไปหน้า ${target} แล้ว`); }}
              onMove={direction => { setTrackRows(previous => moveTrack(previous, track.clientId, direction)); setTrackAnnouncement(`ย้ายเพลงหน้า ${side} ไปที่ลำดับ ${index + direction + 1} แล้ว`); }}
              onRemove={() => setTrackRows(previous => previous.filter(row => row.clientId !== track.clientId))}
              onOrderChanged={() => setTrackAnnouncement(`เรียงลำดับเพลงหน้า ${side} แล้ว`)}
              onChoice={choice => setChoices(previous => [...previous.filter(item => item.id !== choice.id), choice])}
            />)}
          </Reorder.Group> : <p className="help-text">ยังไม่มีเพลงในหน้านี้</p>}
          <button className="button" type="button" onClick={() => setTrackRows(previous => appendTrack(previous, { clientId: crypto.randomUUID(), songId: '', side, position: sideRows.length + 1, durationSec: null, durationText: '', note: null }))}>+ เพิ่มเพลงหน้า {side}</button>
        </section>;
      })}
      {TRACK_SIDES.filter(side => !['A', 'B'].includes(side) && !trackRows.some(track => track.side === side)).map(side =>
        <button className="button admin-add-side" type="button" key={side} onClick={() => setTrackRows(previous => appendTrack(previous, { clientId: crypto.randomUUID(), songId: '', side, position: 1, durationSec: null, durationText: '', note: null }))}>+ เพิ่มหน้า {side}</button>)}
    </div>}

    {kind === 'collections' && <div className="editor-section"><h2>เทปใน Collection</h2>{itemRows.map((item, index) => <div className="track-edit" key={index}><Picker kind="tapes" label={`เทปลำดับ ${index + 1}`} ids={item.tapeId ? [item.tapeId] : []} selected={choices} multiple={false} onChange={(ids, choice) => { setItemRows(previous => previous.map((row, i) => i === index ? { ...row, tapeId: ids[0] || '' } : row)); if (choice) setChoices(previous => [...previous, choice]); }} /><Field label="โน้ต" value={item.note || ''} onChange={value => setItemRows(previous => previous.map((row, i) => i === index ? { ...row, note: value } : row))} maxLength={1000} /><button className="button" type="button" onClick={() => setItemRows(previous => previous.filter((_, i) => i !== index))}>เอาออก</button></div>)}<button className="button" type="button" onClick={() => setItemRows(previous => [...previous, { tapeId: '', note: '' }])}>+ เพิ่มเทป</button></div>}

    {['tapes', 'artists', 'labels', 'collections'].includes(kind) && <div className="editor-section">
      <h2>รูปภาพ</h2>
      {kind === 'tapes' && <>
        <p className="help-text">เลือกประเภทภาพ ตั้งปกหลัก และลากหรือใช้ลูกศรเพื่อเรียงรูป บันทึกฟอร์มเพื่อใช้การเปลี่ยนแปลง</p>
        <span className="sr-only" aria-live="polite">{imageAnnouncement}</span>
        {imageRows.length ? <Reorder.Group as="ol" axis="y" values={imageRows.map(image => image.id)} onReorder={reorderImages} className="admin-image-list">
          {imageRows.map((image, index) => <TapeImageItem key={image.id} image={image} index={index} count={imageRows.length}
            isCover={image.id === coverImageId} canDelete={get('status') !== 'published' || imageRows.length > 1}
            imageBase={imageBase} busy={busy || imageUploading}
            onKindChange={value => { setImageRows(previous => previous.map(row => row.id === image.id ? { ...row, kind: value } : row)); setImageDirty(true); setImageAnnouncement(`เปลี่ยนประเภทภาพรูปที่ ${index + 1} แล้ว`); }}
            onSetCover={() => { setImageRows(previous => [{ ...image, kind: 'front' }, ...previous.filter(row => row.id !== image.id)]); setImageDirty(true); setImageAnnouncement(`ตั้งรูปที่ ${index + 1} เป็นปกหลักแล้ว`); }}
            onMove={direction => moveImage(image.id, direction)} onRemove={() => void removeImage(image.id)}
            onOrderChanged={() => setImageAnnouncement('เรียงลำดับรูปแล้ว')} />)}
        </Reorder.Group> : <p className="empty-state">ยังไม่มีรูปเทป เพิ่มรูปเพื่อแสดงปกในคลัง</p>}
        {get('status') === 'published' && imageRows.length === 1 && <p className="help-text">เทปที่เผยแพร่ต้องมีรูปอย่างน้อยหนึ่งรูป เพิ่มรูปใหม่ก่อนลบรูปนี้</p>}
        {imageDirty && <p className="admin-image-pending" role="status">ยังไม่บันทึกลำดับหรือประเภทภาพ</p>}
        {imageError && <p className="error-text" role="alert">{imageError}</p>}
      </>}
      {kind !== 'tapes' && get(kind === 'artists' ? 'imageKey' : kind === 'labels' ? 'logoKey' : 'coverKey') && imageBase && <div className="admin-image"><img src={imageUrl(get(kind === 'artists' ? 'imageKey' : kind === 'labels' ? 'logoKey' : 'coverKey'), imageBase)} alt="รูปปัจจุบัน" /></div>}
      {(id || kind === 'tapes') ? <ImageUpload entityType={kind as 'tapes' | 'artists' | 'labels' | 'collections'} entityId={id} onBeforeUpload={kind === 'tapes' ? ensureCreated : undefined} disabled={busy} onBusyChange={value => { uploadingRef.current = value; setImageUploading(value); }} onUploaded={result => {
        if (kind === 'tapes') {
          const imageId = result.imageId;
          if (!imageId) { setImageError('อัปโหลดแล้ว แต่แสดงรูปใหม่ไม่ได้ กรุณาโหลดหน้าใหม่'); return; }
          setImageRows(previous => [...previous, { id: imageId, kind: result.kind || 'front', fullKey: result.key, thumbKey: result.thumbKey || result.key, position: previous.length }]);
          setImageError('');
          setImageAnnouncement('เพิ่มรูปใหม่แล้ว');
        } else set(kind === 'artists' ? 'imageKey' : kind === 'labels' ? 'logoKey' : 'coverKey', result.key);
      }} /> : <p className="help-text">บันทึกรายการก่อนเพิ่มรูป</p>}
    </div>}

    <div className="editor-actions">
      {kind === 'tapes' || kind === 'collections' ? <><button className="button" type="button" disabled={busy || imageUploading} onClick={() => void save('draft')}>บันทึกร่าง</button><button className="button button-primary" type="button" disabled={busy || imageUploading} onClick={() => void save(get('status') === 'published' ? 'draft' : 'published')}>{busy ? 'กำลังบันทึก…' : get('status') === 'published' ? 'ยกเลิกเผยแพร่' : 'เผยแพร่'}</button></> : <button className="button button-primary" type="button" disabled={busy || imageUploading} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>}
      {id && <button className="button button-danger" type="button" disabled={busy || imageUploading} onClick={() => void removeEntity()}>ลบรายการ</button>}
      {message && <span className="success-text" role="status">{message}</span>}
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  </div>;
}
