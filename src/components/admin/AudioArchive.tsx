/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { validAudioSignature } from '../../lib/services/audio-validation';
import './AudioArchive.css';

type Provider = 'supabase' | 'firebase' | 'drive';
type Choice = { id: string; label: string };
interface AudioFile {
  id: string; title: string; filename: string; provider: Provider; size: number; contentType: string;
  createdAt: number | string; note: string | null; songId: string | null; tapeId: string | null;
  driveUrl: string | null; status: string;
}
interface Usage {
  provider: Provider; label: string; enabled: boolean; limitBytes: number | null; usedBytes: number;
  reservedBytes: number; downloadLimitBytes: number | null; downloadBytes: number;
  maxFileBytes: number | null; reason?: string;
}
interface ArchiveResponse { files: AudioFile[]; nextCursor: string | null; usage: Usage[] }
interface CreatedResponse { file: AudioFile; uploadUrl?: string }
interface SignedUploadResponse { uploadUrl: string; uploadMethod: 'PUT'; uploadHeaders: Record<string, string>; expiresInSeconds: number }
class AudioRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const endpoint = '/admin/api/audio';
const supabaseTemporaryReservationBytes = 52_428_800;
const providerNames: Record<Provider, string> = { supabase: 'Supabase', firebase: 'Firebase', drive: 'Google Drive' };
const audioTypes: Record<string, string> = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg' };

function bytes(value: number) {
  if (value === 0) return '0 MB';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('th-TH', { maximumFractionDigits: 2 })} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 2 })} MB`;
  return `${Math.ceil(value / 1000).toLocaleString('th-TH')} KB`;
}

function fileDate(value: number | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'ไม่ทราบวันที่' : date.toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
}

function errorText(value: unknown, fallback: string) {
  if (typeof value !== 'object' || value === null) return fallback;
  const body = value as { error?: string | { message?: string }; message?: string };
  return typeof body.error === 'string' ? body.error : body.error?.message || body.message || fallback;
}

/** Refuse a mislabeled file before it takes a Supabase slot that stays locked until its link expires. */
async function signatureProblem(source: File): Promise<string> {
  let head: Uint8Array;
  try { head = new Uint8Array(await source.slice(0, 12).arrayBuffer()); }
  catch { return 'อ่านไฟล์ที่เลือกไม่ได้ กรุณาเลือกไฟล์อีกครั้ง'; }
  return validAudioSignature(head, source.name) ? '' : 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์เพลงที่ระบุ กรุณาเลือกไฟล์เพลงต้นฉบับ';
}

function validAudioId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value);
}

function signedUploadUrl(value: unknown, fileId: string, extension: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname)
      || url.port || url.username || url.password || url.hash || !url.searchParams.get('token')
      || !value.startsWith(`${url.origin}/storage/v1/object/upload/sign/`)) return false;
    const path = url.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/[A-Za-z0-9][A-Za-z0-9_-]{0,62}\/audio\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.([a-z0-9]+)$/u);
    return Boolean(path && path[1] === fileId && path[2] === fileId && path[3] === extension);
  }
  catch { return false; }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...options?.headers } });
  if (response.redirected || response.status === 401) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้งก่อนจัดการไฟล์');
  if (options?.method === 'DELETE' && response.status === 204) return undefined as T;
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(response.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์จัดการไฟล์เพลง' : 'อ่านคำตอบจากระบบไม่ได้ กรุณาโหลดหน้านี้ใหม่หรือตรวจสอบการเข้าสู่ระบบ');
  }
  const data: unknown = await response.json();
  if (!response.ok) throw new AudioRequestError(errorText(data, 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง'), response.status);
  return data as T;
}

async function signedSupabaseUploadUrl(fileId: string, extension: string, contentType: string): Promise<string> {
  const signed = await request<SignedUploadResponse>(`${endpoint}/${encodeURIComponent(fileId)}/sign`, { method: 'POST' });
  if (signed.uploadMethod !== 'PUT' || !signedUploadUrl(signed.uploadUrl, fileId, extension)
    || signed.uploadHeaders?.['Content-Type'] !== contentType || signed.uploadHeaders?.['x-upsert'] !== 'false') {
    throw new Error('ระบบส่งตำแหน่งอัปโหลดไม่ถูกต้อง กรุณาลองอีกครั้ง');
  }
  return signed.uploadUrl;
}

function RelatedRecord({ kind, selected, onChange, disabled }: { kind: 'songs' | 'tapes'; selected: Choice | null; onChange: (value: Choice | null) => void; disabled: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const label = kind === 'songs' ? 'เพลง' : 'เทป';
  useEffect(() => {
    if (query.trim().length < 2 || selected) { setResults([]); setLoading(false); return; }
    let active = true;
    setLoading(true); setError('');
    const timer = window.setTimeout(async () => {
      try {
        const response = await actions.admin.lookup({ kind, query: query.trim() });
        if (response.error) throw new Error(response.error.message);
        if (active) setResults(response.data || []);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'ค้นหาไม่สำเร็จ'); }
      finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [kind, query, selected]);
  return <div className="audio-related">
    {selected ? <span className="admin-field">{label}ที่เกี่ยวข้อง (ไม่บังคับ)</span> : <label className="admin-field" htmlFor={`audio-related-${kind}`}>{label}ที่เกี่ยวข้อง (ไม่บังคับ)</label>}
    {selected ? <div className="audio-selection"><span>{selected.label}</span><button className="button" type="button" disabled={disabled} onClick={() => { onChange(null); setQuery(''); }}>เอาออก<span className="sr-only"> {selected.label}</span></button></div>
      : <input className="field" id={`audio-related-${kind}`} value={query} maxLength={100} disabled={disabled} placeholder={`ค้นหาชื่อ${label}อย่างน้อย 2 ตัวอักษร`} onChange={event => setQuery(event.target.value)} />}
    {!selected && query.trim().length >= 2 && <div className="audio-related-results" aria-label={`ผลค้นหา${label}`}>
      {loading ? <p className="help-text" role="status">กำลังค้นหา…</p> : results.length ? results.map(choice => <button className="button" type="button" key={choice.id} disabled={disabled} onClick={() => { onChange(choice); setQuery(''); }}>{choice.label}</button>) : !error && <p className="help-text">ไม่พบ{label}ชื่อนี้ สามารถบันทึกไฟล์โดยไม่เชื่อมรายการได้</p>}
    </div>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}

function StorageUsage({ usage }: { usage: Usage[] }) {
  return <section className="audio-usage" aria-labelledby="audio-usage-title">
    <h2 id="audio-usage-title">พื้นที่และขีดจำกัด</h2>
    <p className="help-text">ขีดจำกัดด้านล่างใช้กับไฟล์ที่จัดการผ่านเว็บนี้ โควตาบัญชีที่ใช้กับงานอื่นต้องตรวจสอบที่ผู้ให้บริการ</p>
    <dl>{usage.map(item => {
      const total = item.usedBytes + item.reservedBytes;
      const percentage = item.limitBytes ? Math.min(100, total / item.limitBytes * 100) : 0;
      return <div className="audio-usage-row" key={item.provider}>
        <dt>{item.label}<span className={`audio-provider-state${item.enabled ? '' : ' is-blocked'}`}>{item.enabled ? (item.provider === 'drive' ? 'เก็บลิงก์ส่วนตัว' : 'เปิดใช้งาน') : 'ปิดอัปโหลด'}</span></dt>
        <dd>
          {item.provider === 'drive' ? <p className="help-text">ไฟล์อยู่ในบัญชี Google Drive ของคุณ เว็บไม่สามารถอ่านพื้นที่คงเหลือหรือตรวจสอบสิทธิ์แชร์ได้</p> : <>
            <div className="audio-usage-numbers"><span className="mono">{bytes(total)} / {item.limitBytes === null ? 'ไม่ระบุ' : bytes(item.limitBytes)}</span>{item.maxFileBytes !== null && <span>ไม่เกิน {bytes(item.maxFileBytes)} ต่อไฟล์</span>}</div>
            {item.limitBytes !== null && <progress className="audio-meter" max={100} value={percentage} aria-label={`พื้นที่ ${item.label} ที่ใช้และจองไว้`} />}
            {item.reservedBytes > 0 && <p className="help-text">รวมพื้นที่ที่จองหรือกำลังคืน {bytes(item.reservedBytes)}{item.provider === 'supabase' ? ` (รายการที่ยังไม่ยืนยันไฟล์จอง ${bytes(supabaseTemporaryReservationBytes)} ต่อรายการ รายการที่กำลังลบนับตามขนาดจริง)` : ''}</p>}
            {item.downloadLimitBytes !== null && <p className="help-text">ดาวน์โหลดใน 32 วันล่าสุด {bytes(item.downloadBytes)} / {bytes(item.downloadLimitBytes)}</p>}
          </>}
          {item.reason && <p className={item.enabled ? 'help-text' : 'audio-blocked-reason'}>{item.reason}</p>}
        </dd>
      </div>;
    })}</dl>
  </section>;
}

export default function AudioArchive() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'upload' | 'drive' | null>(null);
  const [provider, setProvider] = useState<'supabase' | 'firebase'>('supabase');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [driveConfirmed, setDriveConfirmed] = useState(false);
  const [song, setSong] = useState<Choice | null>(null);
  const [tape, setTape] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState<'reserving' | 'signing' | 'uploading' | 'finalizing' | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryStage, setRetryStage] = useState<'checking' | 'signing' | 'uploading' | 'finalizing' | null>(null);
  const [retryProgress, setRetryProgress] = useState<number | null>(null);
  const [retryError, setRetryError] = useState<{ id: string; message: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const retryInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const titleInput = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);
  const currentSearch = useRef('');
  const activeRequest = useRef<AbortController | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (search: string, cursor?: string): Promise<AudioFile[] | undefined> => {
    const sequence = ++requestSequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ query: search });
      if (cursor) params.set('cursor', cursor);
      const data = await request<ArchiveResponse>(`${endpoint}?${params}`, { signal: controller.signal });
      if (sequence !== requestSequence.current || !mounted.current) return;
      setFiles(previous => cursor ? [...previous, ...data.files.filter(row => !previous.some(existing => existing.id === row.id))] : data.files);
      setUsage(data.usage); setNextCursor(data.nextCursor); setLoaded(true);
      return data.files;
    } catch (cause) {
      if (sequence === requestSequence.current && mounted.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'โหลดคลังไฟล์ไม่ได้');
    } finally { if (sequence === requestSequence.current && mounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load('');
    return () => { mounted.current = false; activeRequest.current?.abort(); xhrRef.current?.abort(); };
  }, [load]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const selectedUsage = usage.find(item => item.provider === (mode === 'drive' ? 'drive' : provider));
  const remaining = selectedUsage?.limitBytes == null ? null : Math.max(0, selectedUsage.limitBytes - selectedUsage.usedBytes - selectedUsage.reservedBytes);
  const fileProblem = file && file.size < 12 ? 'ไฟล์นี้ว่างหรือมีขนาดเล็กเกินกว่าจะเป็นไฟล์เพลง'
    : file && selectedUsage?.maxFileBytes != null && file.size > selectedUsage.maxFileBytes ? `ไฟล์ใหญ่เกินขีดจำกัด ${bytes(selectedUsage.maxFileBytes)} ของ ${selectedUsage.label}`
    : file && mode === 'upload' && provider === 'supabase' && remaining !== null && remaining < supabaseTemporaryReservationBytes
      ? `Supabase ต้องมีพื้นที่ว่างอย่างน้อย ${bytes(supabaseTemporaryReservationBytes)} เพื่อจองอัปโหลดชั่วคราว ตอนนี้เหลือ ${bytes(remaining)}`
    : file && remaining !== null && file.size > remaining ? `พื้นที่เหลือ ${bytes(remaining)} ไม่พอสำหรับไฟล์นี้` : '';

  function openForm(next: 'upload' | 'drive') {
    setMode(next); setFormError(''); setMessage('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    if (next === 'upload') {
      const available = usage.find(item => item.provider !== 'drive' && item.enabled);
      if (available) setProvider(available.provider as 'supabase' | 'firebase');
    }
    window.setTimeout(() => titleInput.current?.focus(), 0);
  }

  function upload(url: string, source: File, headers: Record<string, string>, onProgress: (percentage: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('PUT', url);
      // Signed Supabase uploads must not send the admin's session to the storage origin.
      xhr.withCredentials = false;
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.timeout = 15 * 60 * 1000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100))); };
      xhr.onload = () => {
        xhrRef.current = null;
        if (xhr.responseURL && new URL(xhr.responseURL).pathname === '/login') { reject(new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบแล้วอัปโหลดอีกครั้ง')); return; }
        if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
        let detail = 'อัปโหลดไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
        try { detail = errorText(JSON.parse(xhr.responseText), detail); } catch { /* A provider may return a plain-text response. */ }
        reject(new Error(detail));
      };
      xhr.onerror = () => { xhrRef.current = null; reject(new Error('การเชื่อมต่อขาดหายระหว่างอัปโหลด')); };
      xhr.ontimeout = () => { xhrRef.current = null; reject(new Error('อัปโหลดใช้เวลานานเกินไป กรุณาลองอีกครั้ง')); };
      xhr.onabort = () => { xhrRef.current = null; reject(new Error('ยกเลิกการอัปโหลดแล้ว')); };
      xhr.send(source);
    });
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !mode || !title.trim()) return;
    setFormError(''); setMessage('');
    if (!selectedUsage?.enabled) { setFormError(selectedUsage?.reason || 'พื้นที่นี้ยังไม่พร้อมใช้งาน'); return; }
    if (mode === 'upload' && (!file || fileProblem)) { setFormError(fileProblem || 'เลือกไฟล์เพลงก่อนอัปโหลด'); return; }
    if (mode === 'drive' && !driveConfirmed) { setFormError('ตรวจสอบสิทธิ์แชร์ไฟล์ใน Google Drive แล้วทำเครื่องหมายยืนยัน'); return; }
    const extension = file?.name.split('.').at(-1)?.toLowerCase() || '';
    if (mode === 'upload' && !audioTypes[extension]) { setFormError('รองรับไฟล์ MP3, FLAC, WAV, M4A และ OGG'); return; }
    const contentType = mode === 'upload' ? audioTypes[extension] : 'application/octet-stream';
    setBusy(true); setProgress(null); setUploadStage('reserving');
    let reserved = false;
    let directUploadFinished = false;
    let signedUrlIssued = false;
    let signRequested = false;
    let reservedId = '';
    let rowFailure = '';
    try {
      if (mode === 'upload') {
        const problem = await signatureProblem(file!);
        if (problem) throw new Error(problem);
      }
      const result = await request<CreatedResponse>(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), provider: mode === 'drive' ? 'drive' : provider,
          filename: mode === 'drive' ? title.trim().replace(/[/\\]/g, '-') : file!.name, size: mode === 'drive' ? 0 : file!.size,
          contentType, note: note.trim() || undefined, songId: song?.id, tapeId: tape?.id,
          ...(mode === 'drive' ? { driveUrl: driveUrl.trim(), driveRestrictedConfirmed: driveConfirmed } : {}),
        }),
      });
      if (mode === 'upload') {
        reserved = true;
        if (validAudioId(result.file?.id)) reservedId = result.file.id;
        if (!file) throw new Error('ไม่พบไฟล์ที่เลือก กรุณาเลือกไฟล์อีกครั้ง');
        if (!validAudioId(result.file?.id)) throw new Error('ระบบส่งรหัสไฟล์ที่จองไว้ไม่ถูกต้อง กรุณาลองอีกครั้ง');
        let uploadUrl = result.uploadUrl;
        let uploadHeaders: Record<string, string> = { 'Content-Type': contentType };
        if (provider === 'supabase') {
          setUploadStage('signing');
          signRequested = true;
          uploadUrl = await signedSupabaseUploadUrl(result.file.id, extension, contentType);
          signedUrlIssued = true;
          uploadHeaders = { 'Content-Type': contentType, 'x-upsert': 'false' };
        }
        if (!uploadUrl) throw new Error('ระบบไม่ได้ส่งตำแหน่งอัปโหลด กรุณาลองอีกครั้ง');
        setUploadStage('uploading');
        setProgress(0);
        await upload(uploadUrl, file, uploadHeaders, setProgress);
        if (provider === 'supabase') {
          directUploadFinished = true;
          setUploadStage('finalizing');
          await request<{ file: AudioFile }>(`${endpoint}/${encodeURIComponent(result.file.id)}/finalize`, { method: 'POST' });
        }
      }
      setMessage(mode === 'drive' ? 'เพิ่มลิงก์ Google Drive แล้ว' : 'เก็บไฟล์เพลงแล้ว');
      setTitle(''); setNote(''); setFile(null); setDriveUrl(''); setDriveConfirmed(false); setSong(null); setTape(null); setMode(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'บันทึกไฟล์ไม่สำเร็จ';
      const rejected = cause instanceof AudioRequestError && cause.status === 400;
      const failure = (directUploadFinished
        ? rejected
          ? `${detail} (ลบได้หลังลิงก์อัปโหลดหมดอายุ ประมาณ 2 ชั่วโมง 15 นาที)`
          : `${detail} ไฟล์ส่งครบแล้วแต่ยังยืนยันไม่สำเร็จ กด “ตรวจสอบไฟล์” ที่รายการนี้ก่อนส่งซ้ำ`
        : `${detail}${reserved ? provider === 'supabase'
          ? signedUrlIssued
            ? ' รายการนี้ยังจองพื้นที่ไว้ กด “ส่งไฟล์เดิม” ที่รายการนี้เพื่อส่งอีกครั้ง อย่าอัปโหลดใหม่เพราะจะจองพื้นที่เพิ่มอีกรายการ รายการนี้ลบได้หลังลิงก์อัปโหลดหมดอายุ'
            : !signRequested || cause instanceof AudioRequestError
              ? ' รายการนี้ยังจองพื้นที่ไว้ กด “ส่งไฟล์เดิม” ที่รายการนี้เพื่อลองอีกครั้ง หรือลบเพื่อคืนพื้นที่ได้ทันที'
              // The Worker may have issued a link whose response never arrived.
              : ' รายการนี้ยังจองพื้นที่ไว้ กด “ส่งไฟล์เดิม” ที่รายการนี้เพื่อลองอีกครั้ง หากลบไม่ได้ ให้รอลิงก์อัปโหลดหมดอายุก่อน'
          : ' รายการนี้ยังจองพื้นที่ไว้ ตรวจสอบสถานะด้านล่างก่อนลองใหม่ หากกำลังอัปโหลดจะลบได้หลัง 15 นาที' : ''}`);
      if (reserved && provider === 'supabase' && reservedId) {
        // The reserved row now owns this file; keeping the form open invites a second reservation.
        setRetryError({ id: reservedId, message: failure }); rowFailure = failure;
        setTitle(''); setNote(''); setFile(null); setSong(null); setTape(null); setMode(null);
        if (fileInput.current) fileInput.current.value = '';
      } else setFormError(failure);
    } finally {
      setBusy(false); setProgress(null); setUploadStage(null);
      // Show a newly reserved row even if the prior search would hide it.
      if (reserved) { currentSearch.current = ''; setQuery(''); setActiveQuery(''); }
      const rows = await load(currentSearch.current);
      if (rowFailure && rows && !rows.some(item => item.id === reservedId)) setError(rowFailure);
    }
  }

  async function checkUpload(row: AudioFile) {
    if (busy || checking || deleting) return;
    setChecking(row.id); setError(''); setMessage('');
    try {
      await request<{ file: AudioFile }>(`${endpoint}/${encodeURIComponent(row.id)}/finalize`, { method: 'POST' });
      setMessage(`ตรวจสอบและบันทึกไฟล์ “${row.title}” แล้ว`);
      await load(currentSearch.current);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'ตรวจสอบไฟล์ไม่สำเร็จ';
      // Reload first (it clears errors); a rejected file has just become failed.
      await load(currentSearch.current);
      setError(detail);
    } finally { setChecking(null); }
  }

  async function retryUpload(row: AudioFile, source: File) {
    if (busy || checking || deleting || downloading) return;
    setRetryError(null); setError(''); setMessage('');
    if (!validAudioId(row.id) || row.provider !== 'supabase' || !['pending', 'uploading'].includes(row.status)) {
      setRetryError({ id: row.id, message: 'รายการนี้ไม่พร้อมรับไฟล์อีกครั้ง กรุณาโหลดรายการใหม่' });
      return;
    }
    const extension = row.filename.split('.').at(-1)?.toLowerCase() || '';
    if (source.name !== row.filename) {
      setRetryError({ id: row.id, message: `เลือกไฟล์ต้นฉบับชื่อ “${row.filename}” เพื่อส่งต่อรายการเดิม` });
      return;
    }
    if (source.size !== row.size) {
      setRetryError({ id: row.id, message: `ไฟล์ต้องมีขนาด ${row.size.toLocaleString('th-TH')} ไบต์ตรงกับรายการเดิม` });
      return;
    }
    if (audioTypes[extension] !== row.contentType) {
      setRetryError({ id: row.id, message: 'ชนิดไฟล์ในรายการเดิมไม่ถูกต้อง กรุณาตรวจสอบข้อมูลไฟล์' });
      return;
    }
    const problem = await signatureProblem(source);
    if (problem) { setRetryError({ id: row.id, message: problem }); return; }
    setBusy(true); setRetrying(row.id); setRetryStage('checking'); setRetryProgress(null);
    let uploaded = false;
    let failure = '';
    try {
      const finalizeUrl = `${endpoint}/${encodeURIComponent(row.id)}/finalize`;
      try {
        await request<{ file: AudioFile }>(finalizeUrl, { method: 'POST' });
        setMessage(`พบไฟล์ “${row.title}” ในพื้นที่เก็บและบันทึกเรียบร้อยแล้ว`);
        return;
      } catch (cause) {
        if (!(cause instanceof AudioRequestError) || cause.status !== 409) throw cause;
      }
      setRetryStage('signing');
      const url = await signedSupabaseUploadUrl(row.id, extension, row.contentType);
      setRetryStage('uploading'); setRetryProgress(0);
      await upload(url, source, { 'Content-Type': row.contentType, 'x-upsert': 'false' }, setRetryProgress);
      uploaded = true;
      setRetryStage('finalizing');
      await request<{ file: AudioFile }>(finalizeUrl, { method: 'POST' });
      setMessage(`ส่งและบันทึกไฟล์ “${row.title}” แล้ว`);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'ส่งไฟล์เดิมไม่สำเร็จ';
      failure = cause instanceof AudioRequestError && cause.status === 400
        ? `${detail} (ลบได้หลังลิงก์อัปโหลดหมดอายุ ประมาณ 2 ชั่วโมง 15 นาที)`
        : uploaded
          ? `${detail} ไฟล์ส่งครบแล้ว กด “ตรวจสอบไฟล์” ก่อนเลือกส่งอีกครั้ง`
          : `${detail} รายการเดิมยังจองพื้นที่อยู่ เลือกไฟล์เดิมเพื่อลองส่งอีกครั้งได้`;
      setRetryError({ id: row.id, message: failure });
    } finally {
      setBusy(false); setRetrying(null); setRetryStage(null); setRetryProgress(null);
      const rows = await load(currentSearch.current);
      // The reload shows only the first page; keep the error visible if the row left it.
      if (failure && rows && !rows.some(item => item.id === row.id)) setError(`ส่งไฟล์ “${row.title}” ไม่สำเร็จ: ${failure}`);
    }
  }

  async function remove(row: AudioFile) {
    if (busy || deleting) return;
    const prompt = row.provider === 'drive' ? `ลบลิงก์ “${row.title}” ออกจากคลัง? ไฟล์ต้นฉบับใน Google Drive จะยังอยู่`
      : `ลบไฟล์ “${row.title}” ออกจากคลังและพื้นที่เก็บไฟล์? การลบนี้เรียกคืนไม่ได้`;
    if (!window.confirm(prompt)) return;
    setDeleting(row.id); setError(''); setMessage('');
    try {
      await request<unknown>(`${endpoint}/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      setMessage(row.provider === 'drive' ? 'ลบลิงก์ออกจากคลังแล้ว ไฟล์ใน Google Drive ยังคงอยู่' : 'ลบไฟล์เพลงแล้ว');
      await load(currentSearch.current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ลบไฟล์ไม่สำเร็จ'); }
    finally { setDeleting(null); }
  }

  async function download(row: AudioFile) {
    if (busy || downloading) return;
    setDownloading(row.id); setError('');
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(row.id)}`, { credentials: 'same-origin' });
      if (response.redirected || response.status === 401) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้งก่อนดาวน์โหลด');
      if (response.headers.get('content-type')?.includes('application/json')) throw new Error(errorText(await response.json(), 'ดาวน์โหลดไม่สำเร็จ'));
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('ดาวน์โหลดไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และลองอีกครั้ง');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = row.filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMessage(`ส่งไฟล์ “${row.title}” ให้เบราว์เซอร์ดาวน์โหลดแล้ว`);
      await load(currentSearch.current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ดาวน์โหลดไม่สำเร็จ'); }
    finally { setDownloading(null); }
  }

  function search(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const value = query.trim();
    currentSearch.current = value;
    setActiveQuery(value); void load(value);
  }

  return <div className="audio-archive">
    {usage.length > 0 && <StorageUsage usage={usage} />}
    <section className="section" aria-labelledby="audio-files-title">
      <div className="section-heading audio-heading"><h2 id="audio-files-title">ไฟล์ในคลัง</h2><div className="audio-actions">
        <button className="button button-primary" type="button" disabled={!loaded || busy || !!deleting} onClick={() => openForm('upload')}>อัปโหลดไฟล์</button>
        <button className="button" type="button" disabled={!loaded || busy || !!deleting} onClick={() => openForm('drive')}>เพิ่มลิงก์ Google Drive</button>
      </div></div>

      {mode && <form className="audio-form" onSubmit={event => void save(event)} aria-labelledby="audio-form-title">
        <div className="audio-heading"><h3 id="audio-form-title">{mode === 'drive' ? 'เพิ่มลิงก์ Google Drive' : 'อัปโหลดไฟล์เพลง'}</h3><button type="button" className="button" disabled={busy} onClick={() => { setMode(null); setFormError(''); }}>ปิดแบบฟอร์ม</button></div>
        <div className="admin-form-grid">
          <label className="admin-field admin-field-full">ชื่อไฟล์ในคลัง<input className="field" ref={titleInput} required maxLength={200} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="เช่น ชื่อเพลง หรือชื่อชุด หน้า A" /></label>
          {mode === 'upload' ? <>
            <label className="admin-field admin-field-full">พื้นที่เก็บไฟล์<select className="field" value={provider} disabled={busy} onChange={event => setProvider(event.target.value as 'supabase' | 'firebase')}>
              {usage.filter(item => item.provider !== 'drive').map(item => <option key={item.provider} value={item.provider}>{item.label}{item.enabled ? '' : ' (ปิดอัปโหลด)'}</option>)}
            </select></label>
            {!selectedUsage?.enabled && <p className="audio-blocked-reason admin-field-full" role="status">{selectedUsage?.reason || 'พื้นที่นี้ยังไม่พร้อมใช้งาน'}</p>}
            {provider === 'supabase' && selectedUsage?.enabled && <p className="help-text audio-direct-note admin-field-full">ไฟล์จะส่งตรงไปยัง Supabase Storage ต้องมีพื้นที่ว่าง {bytes(supabaseTemporaryReservationBytes)} เพื่อจองชั่วคราว หลังยืนยันแล้วระบบจะนับตามขนาดไฟล์จริง</p>}
            <label className="admin-field admin-field-full">เลือกไฟล์เพลง<input ref={fileInput} className="field" type="file" accept=".mp3,.flac,.wav,.m4a,.ogg,audio/mpeg,audio/flac,audio/wav,audio/mp4,audio/ogg" required disabled={busy || !selectedUsage?.enabled} onChange={event => { const value = event.target.files?.[0] || null; setFile(value); if (value && !title.trim()) setTitle(value.name.replace(/\.[^.]+$/, '').slice(0, 200)); setFormError(''); }} />
              <span className="help-text">MP3, FLAC, WAV, M4A หรือ OGG{selectedUsage?.maxFileBytes != null ? ` · ไม่เกิน ${bytes(selectedUsage.maxFileBytes)} ต่อไฟล์` : ''} · เก็บต้นฉบับโดยไม่แปลงเสียง</span>
              {file && <span className="help-text audio-break">{file.name} · {bytes(file.size)}</span>}
            </label>
            {fileProblem && <p className="error-text admin-field-full" role="alert">{fileProblem} ใช้ลิงก์ Google Drive สำหรับไฟล์ขนาดใหญ่ได้</p>}
          </> : <>
            <label className="admin-field admin-field-full">ลิงก์ไฟล์ Google Drive<input className="field" type="url" required maxLength={1000} value={driveUrl} disabled={busy} placeholder="https://drive.google.com/file/d/…/view" onChange={event => { setDriveUrl(event.target.value); setDriveConfirmed(false); }} /><span className="help-text">ไฟล์ยังอยู่ใน Drive ของคุณ ระบบจะบันทึกลิงก์โดยไม่คัดลอกไฟล์</span></label>
            <div className="audio-drive-notice admin-field-full"><p>ใน Google Drive ให้ตั้งการเข้าถึงทั่วไปเป็น <strong>จำกัด (Restricted)</strong> และแชร์เฉพาะบัญชีแอดมินที่ต้องใช้ไฟล์</p><label className="admin-check"><input type="checkbox" required checked={driveConfirmed} disabled={busy} onChange={event => setDriveConfirmed(event.target.checked)} />ฉันตรวจสอบแล้วว่าไฟล์นี้จำกัดสิทธิ์ไว้เฉพาะแอดมิน</label><p className="help-text">เว็บจำกัดสิทธิ์การเห็นลิงก์ แต่ไม่สามารถตั้งค่าหรือตรวจสอบสิทธิ์แชร์ใน Drive แทนคุณได้</p></div>
          </>}
          <label className="admin-field admin-field-full">หมายเหตุ (ไม่บังคับ)<textarea className="field" rows={3} maxLength={2000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="เช่น บันทึกจากเทปต้นฉบับ หน้า A หรือรายละเอียดเวอร์ชัน" /></label>
        </div>
        <details className="audio-relations"><summary>เชื่อมกับข้อมูลเพลงหรือเทป (ไม่บังคับ)</summary><div className="admin-form-grid"><RelatedRecord kind="songs" selected={song} onChange={setSong} disabled={busy} /><RelatedRecord kind="tapes" selected={tape} onChange={setTape} disabled={busy} /></div></details>
        {formError && <p className="error-text" role="alert">{formError}</p>}
        {busy && !retrying && <div className="audio-progress" role="status"><p>{mode === 'drive' ? 'กำลังบันทึกลิงก์…' : uploadStage === 'reserving' ? 'กำลังจองพื้นที่สำหรับไฟล์…' : uploadStage === 'signing' ? 'กำลังเตรียมช่องทางอัปโหลด…' : uploadStage === 'finalizing' ? 'ส่งไฟล์ครบแล้ว กำลังตรวจสอบและบันทึก…' : progress === 100 ? 'ส่งไฟล์ครบแล้ว กำลังรอผู้ให้บริการตอบกลับ…' : `กำลังอัปโหลด ${progress ?? 0}%`}</p>{progress !== null && <progress className="audio-meter" value={progress} max={100} aria-label="ความคืบหน้าการอัปโหลด" />}<p className="help-text">เปิดหน้านี้ไว้จนกว่าจะบันทึกเสร็จ</p></div>}
        <div className="audio-actions"><button className="button button-primary" type="submit" disabled={busy || !selectedUsage?.enabled || !!fileProblem}>{busy ? retrying ? 'กำลังส่งไฟล์เดิม…' : 'กำลังบันทึก…' : mode === 'drive' ? 'บันทึกลิงก์' : 'อัปโหลดไฟล์เพลง'}</button>{busy && !retrying && uploadStage === 'uploading' && progress !== null && progress < 100 && <button className="button" type="button" onClick={() => xhrRef.current?.abort()}>ยกเลิกอัปโหลด</button>}</div>
      </form>}

      <form className="search-page-form audio-search" role="search" onSubmit={search}><label className="sr-only" htmlFor="audio-query">ค้นหาไฟล์เพลง</label><input className="field" id="audio-query" type="search" value={query} maxLength={100} disabled={busy} placeholder="ค้นหาชื่อไฟล์เพลง" onChange={event => setQuery(event.target.value)} /><button className="button" disabled={loading || busy} type="submit">ค้นหา</button>{activeQuery && <button className="button" type="button" disabled={loading || busy} onClick={() => { currentSearch.current = ''; setQuery(''); setActiveQuery(''); void load(''); }}>ล้าง</button>}</form>
      {message && <p className="success-text" role="status">{message}</p>}
      {error && <div className="audio-error" role="alert"><p className="error-text">{error}</p><button className="button" type="button" disabled={loading} onClick={() => void load(activeQuery)}>ลองโหลดอีกครั้ง</button> <a href="/login?next=%2Fadmin%2Faudio">เข้าสู่ระบบ</a></div>}
      {loading && !loaded ? <div className="audio-loading" role="status"><p>กำลังอ่านรายการไฟล์และพื้นที่คงเหลือ…</p><div /><div /><div /></div> : <>
        {files.length ? <div className="table-wrap"><table className="data-table audio-file-table" aria-busy={loading}><caption className="sr-only">ไฟล์เพลงส่วนตัวของแอดมิน{activeQuery ? ` ผลค้นหา ${activeQuery}` : ''}</caption><thead><tr><th scope="col">ชื่อไฟล์</th><th scope="col">พื้นที่จัดเก็บ</th><th scope="col">ขนาด</th><th scope="col">วันที่เพิ่ม</th><th scope="col">จัดการ</th></tr></thead><tbody>
          {files.map(row => <tr key={row.id}>
            <td data-label="ชื่อไฟล์"><strong>{row.title}</strong>{row.filename !== row.title && <span className="audio-file-meta">{row.filename}</span>}{row.note && <span className="audio-file-meta">{row.note}</span>}{row.status !== 'ready' && <span className="audio-pending">{row.status === 'pending' ? 'รออัปโหลดให้เสร็จ' : row.status === 'failed' ? row.provider === 'supabase' ? 'ไฟล์ไม่ผ่านการตรวจสอบ ลบรายการได้หลังลิงก์อัปโหลดหมดอายุ' : 'อัปโหลดไม่สำเร็จ ลบรายการเพื่อคืนพื้นที่จอง' : row.status === 'uploading' ? row.provider === 'supabase' ? 'กำลังอัปโหลดหรือรอตรวจสอบไฟล์' : 'กำลังอัปโหลด' : row.status === 'deleting' ? 'กำลังลบไฟล์' : 'ไฟล์ยังไม่พร้อมใช้งาน'}</span>}{retrying === row.id && <div className="audio-retry-progress" role="status"><p>{retryStage === 'checking' ? 'กำลังตรวจว่ามีไฟล์เดิมอยู่แล้วหรือไม่…' : retryStage === 'signing' ? 'กำลังเตรียมลิงก์ส่งไฟล์เดิม…' : retryStage === 'finalizing' ? 'ส่งไฟล์ครบแล้ว กำลังยืนยัน…' : retryProgress === 100 ? 'ส่งไฟล์ครบแล้ว กำลังรอผู้ให้บริการ…' : `กำลังส่งไฟล์เดิม ${retryProgress ?? 0}%`}</p>{retryProgress !== null && <progress className="audio-meter" value={retryProgress} max={100} aria-label={`ความคืบหน้าการส่งไฟล์ ${row.title}`} />}<p className="help-text">เปิดหน้านี้ไว้จนกว่าจะบันทึกเสร็จ</p></div>}{retryError?.id === row.id && <p className="audio-retry-error error-text" role="alert">{retryError.message}</p>}{(row.songId || row.tapeId) && <span className="audio-record-links">{row.songId && <a href={`/admin/songs/${encodeURIComponent(row.songId)}`}>ข้อมูลเพลง</a>}{row.tapeId && <a href={`/admin/tapes/${encodeURIComponent(row.tapeId)}`}>ข้อมูลเทป</a>}</span>}</td>
            <td data-label="พื้นที่จัดเก็บ">{providerNames[row.provider]}</td><td data-label="ขนาด" className="mono">{row.provider === 'drive' && !row.size ? 'ดูใน Drive' : bytes(row.size)}</td><td data-label="วันที่เพิ่ม">{fileDate(row.createdAt)}</td>
            <td data-label="จัดการ"><div className="audio-row-actions">{row.status === 'ready' && (row.provider === 'drive' ? <a className="button" href={`${endpoint}/${encodeURIComponent(row.id)}`} target="_blank" rel="noopener noreferrer">เปิดใน Drive<span className="sr-only"> {row.title}</span></a> : <button className="button" type="button" disabled={busy || !!downloading || deleting === row.id} onClick={() => void download(row)}>{downloading === row.id ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลด'}<span className="sr-only"> {row.title}</span></button>)}{row.provider === 'supabase' && row.status === 'uploading' && <button className="button" type="button" disabled={busy || !!checking || !!deleting} onClick={() => void checkUpload(row)}>{checking === row.id ? 'กำลังตรวจสอบ…' : 'ตรวจสอบไฟล์'}<span className="sr-only"> {row.title}</span></button>}{row.provider === 'supabase' && ['pending', 'uploading'].includes(row.status) && <><input className="audio-retry-input" type="file" accept={`.${row.filename.split('.').at(-1)?.toLowerCase() || 'mp3'}`} disabled={busy} aria-label={`เลือกไฟล์ต้นฉบับ ${row.filename} เพื่อส่งอีกครั้ง`} ref={input => { retryInputs.current[row.id] = input; }} onChange={event => { const source = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (source) void retryUpload(row, source); }} /><button className="button" type="button" disabled={busy || !!checking || !!deleting || !!downloading} onClick={() => retryInputs.current[row.id]?.click()}>ส่งไฟล์เดิม<span className="sr-only"> {row.title}</span></button></>}{retrying === row.id && retryStage === 'uploading' && retryProgress !== null && retryProgress < 100 && <button className="button" type="button" onClick={() => xhrRef.current?.abort()}>ยกเลิกส่งไฟล์<span className="sr-only"> {row.title}</span></button>}<button type="button" className="button button-danger" disabled={busy || !!deleting || !!checking || downloading === row.id} onClick={() => void remove(row)}>{deleting === row.id ? 'กำลังลบ…' : row.provider === 'drive' ? 'ลบลิงก์' : 'ลบไฟล์'}<span className="sr-only"> {row.title}</span></button></div></td>
          </tr>)}
        </tbody></table></div> : loaded && !error && <p className="empty-state">{activeQuery ? `ไม่พบไฟล์ที่ตรงกับ “${activeQuery}” ลองค้นด้วยชื่ออื่น` : 'ยังไม่มีไฟล์เพลง เริ่มจากอัปโหลดไฟล์หรือเพิ่มลิงก์ Google Drive ที่จำกัดสิทธิ์ไว้แล้ว'}</p>}
        {loading && loaded && <p className="help-text" role="status">กำลังโหลดรายการ…</p>}
        {nextCursor && <p className="pagination"><button className="button" type="button" disabled={loading || busy} onClick={() => void load(activeQuery, nextCursor)}>โหลดรายการถัดไป</button></p>}
      </>}
    </section>
  </div>;
}
