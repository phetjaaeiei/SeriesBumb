/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';

export interface ReviewQueueRow { id: string; body: string; rating: number; authorName: string; tapeTitle: string; tapeSlug: string }
export interface CorrectionQueueRow { id: string; proposedChange: string; sourceUrl: string | null; authorName: string; targetKind: string; targetTitle: string }

export default function ModerationQueue({ reviews: initialReviews, corrections: initialCorrections }: { reviews: ReviewQueueRow[]; corrections: CorrectionQueueRow[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [corrections, setCorrections] = useState(initialCorrections);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function decideReview(id: string, status: 'published' | 'rejected') {
    setBusy(id); setMessage('');
    const result = await actions.admin.reviews.moderate({ id, status });
    if (result.error) setMessage(result.error.message);
    else { setReviews(rows => rows.filter(row => row.id !== id)); setMessage(status === 'published' ? 'เผยแพร่รีวิวแล้ว' : 'ปฏิเสธรีวิวแล้ว'); }
    setBusy(null);
  }
  async function decideCorrection(id: string, status: 'accepted' | 'rejected') {
    setBusy(id); setMessage('');
    const result = await actions.admin.reviews.moderateCorrection({ id, status });
    if (result.error) setMessage(result.error.message);
    else { setCorrections(rows => rows.filter(row => row.id !== id)); setMessage(status === 'accepted' ? 'รับข้อเสนอแล้ว กรุณาแก้ข้อมูลจริงในรายการ' : 'ปฏิเสธข้อเสนอแล้ว'); }
    setBusy(null);
  }
  return <div>
    {message && <p role="status" className="help-text">{message}</p>}
    <section className="section"><h2>รีวิวรอตรวจ ({reviews.length})</h2>
      {reviews.length ? <ul className="plain-list">{reviews.map(row => <li key={row.id} className="section"><p><strong>{row.tapeTitle}</strong> · {row.rating}/5 ดาว · {row.authorName}</p><p>{row.body}</p><div className="admin-tape-image-actions"><button className="button button-primary" disabled={busy !== null} onClick={() => void decideReview(row.id, 'published')}>อนุมัติรีวิว</button><button className="button" disabled={busy !== null} onClick={() => void decideReview(row.id, 'rejected')}>ปฏิเสธ</button></div></li>)}</ul> : <p className="empty-state">ไม่มีรีวิวรอตรวจ</p>}
    </section>
    <section className="section"><h2>ข้อเสนอแก้ข้อมูล ({corrections.length})</h2>
      {corrections.length ? <ul className="plain-list">{corrections.map(row => <li key={row.id} className="section"><p><strong>{row.targetTitle}</strong> · {row.authorName}</p><p>{row.proposedChange}</p>{row.sourceUrl && <p><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">เปิดแหล่งอ้างอิง ↗</a></p>}<p className="help-text">การรับข้อเสนอจะเปลี่ยนสถานะเท่านั้น แอดมินต้องตรวจและแก้รายการเอง</p><div className="admin-tape-image-actions"><button className="button button-primary" disabled={busy !== null} onClick={() => void decideCorrection(row.id, 'accepted')}>รับข้อเสนอ</button><button className="button" disabled={busy !== null} onClick={() => void decideCorrection(row.id, 'rejected')}>ปฏิเสธ</button></div></li>)}</ul> : <p className="empty-state">ไม่มีข้อเสนอรอตรวจ</p>}
    </section>
  </div>;
}
