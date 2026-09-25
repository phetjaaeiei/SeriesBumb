/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';
import { resizeImage } from '../../lib/client/image-resize';

type EntityType = 'tapes' | 'artists' | 'labels' | 'collections';
type ImageKind = 'front' | 'back' | 'inside' | 'cassette' | 'other';
interface Props {
  entityType: EntityType;
  entityId: string;
  onUploaded: (value: { key: string; thumbKey?: string; imageId?: string }) => void;
}

function uploadInput(entityType: EntityType, entityId: string, variant: 'full' | 'thumb', file: File, width: number, height: number, uuid?: string, kind?: ImageKind) {
  const form = new FormData();
  form.set('entityType', entityType);
  form.set('entityId', entityId);
  form.set('variant', variant);
  form.set('file', file);
  form.set('width', String(width));
  form.set('height', String(height));
  if (uuid) form.set('uuid', uuid);
  if (kind) form.set('kind', kind);
  return form;
}

export default function ImageUpload({ entityType, entityId, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<ImageKind>('front');

  async function upload(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    setMessage('');
    for (const [index, source] of Array.from(files).entries()) {
      try {
        setMessage(`กำลังอัปโหลดรูป ${index + 1}/${files.length}…`);
        const full = await resizeImage(source, entityType === 'tapes' ? 1600 : 1200);
        const thumb = await resizeImage(source, 480);
        const first = await actions.admin.images.upload(uploadInput(entityType, entityId, 'full', full.file, full.width, full.height));
        if (first.error || !first.data) throw new Error(first.error?.message || 'อัปโหลดรูปเต็มไม่สำเร็จ');
        const second = await actions.admin.images.upload(uploadInput(entityType, entityId, 'thumb', thumb.file, thumb.width, thumb.height, first.data.uuid, kind));
        if (second.error || !second.data) throw new Error(second.error?.message || 'อัปโหลดรูปย่อไม่สำเร็จ');
        onUploaded({ key: second.data.fullKey || first.data.key, thumbKey: second.data.thumbKey, imageId: second.data.imageId });
      } catch (error) {
        setMessage(`รูป ${index + 1}: ${error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ'}`);
        setBusy(false);
        return;
      }
    }
    setMessage(`อัปโหลดแล้ว ${files.length} รูป`);
    setBusy(false);
  }

  return <div className="image-upload">
    {entityType === 'tapes' && <label className="admin-field">ประเภทภาพ<select className="field" value={kind} onChange={event => setKind(event.target.value as ImageKind)}><option value="front">ปกหน้า</option><option value="back">ปกหลัง</option><option value="inside">ด้านใน</option><option value="cassette">ตลับเทป</option><option value="other">อื่น ๆ</option></select></label>}
    <label className="admin-field">{entityType === 'tapes' ? 'เพิ่มรูปเทป' : 'เลือกรูป'}<input className="field" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={entityType === 'tapes'} disabled={busy} onChange={event => { void upload(event.target.files); event.target.value = ''; }} /></label>
    <p className="help-text">รูปจะถูกย่อบนเครื่องก่อนอัปโหลด รองรับ JPEG, PNG, WebP และ HEIC ที่เบราว์เซอร์เปิดได้</p>
    {message && <p className="help-text" role="status">{message}</p>}
  </div>;
}
