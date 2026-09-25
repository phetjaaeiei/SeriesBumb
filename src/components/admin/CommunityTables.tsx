/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';

export interface AdminUserRow { id: string; name: string; email: string; role: 'member' | 'admin'; commentBanned: number; createdAt: number; protectedAdmin: boolean; self: boolean }
export interface AdminCommentRow { id: string; body: string; createdAt: number; deletedAt: number | null; canRestore: boolean; authorName: string; authorEmail: string; targetTitle: string | null; targetUrl: string | null }
const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });

export function AdminUsersTable({ initialRows }: { initialRows: AdminUserRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function role(row: AdminUserRow) {
    const next = row.role === 'admin' ? 'member' : 'admin';
    if (!window.confirm(`${next === 'admin' ? 'แต่งตั้ง' : 'ถอดสิทธิ์'}แอดมิน ${row.name}?`)) return;
    setBusyId(row.id); setError('');
    try {
      const response = await actions.admin.users.setRole({ id: row.id, role: next });
      if (response.error) throw new Error(response.error.message);
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, role: next, commentBanned: next === 'admin' ? 0 : item.commentBanned } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'เปลี่ยนสิทธิ์ไม่สำเร็จ'); }
    finally { setBusyId(''); }
  }

  async function ban(row: AdminUserRow) {
    const next = !row.commentBanned;
    if (next && !window.confirm(`ระงับการคอมเมนต์ของ ${row.name}?`)) return;
    setBusyId(row.id); setError('');
    try {
      const response = await actions.admin.users.setCommentBan({ id: row.id, banned: next });
      if (response.error) throw new Error(response.error.message);
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, commentBanned: Number(next) } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'เปลี่ยนสถานะไม่สำเร็จ'); }
    finally { setBusyId(''); }
  }

  return <div className="table-wrap">{error && <p className="error-text" role="alert">{error}</p>}<table className="data-table"><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>คอมเมนต์</th><th>สมัครเมื่อ</th><th>จัดการ</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.email}</td><td>{row.role === 'admin' ? 'แอดมิน' : 'สมาชิก'}</td><td>{row.commentBanned ? 'ถูกระงับ' : 'ปกติ'}</td><td>{dateFormat.format(row.createdAt)}</td><td className="admin-row-actions"><button className="button" type="button" disabled={busyId === row.id || row.self || (row.role === 'admin' && row.protectedAdmin)} onClick={() => void role(row)}>{row.role === 'admin' ? 'ถอดสิทธิ์' : 'ตั้งเป็นแอดมิน'}</button><button className="button" type="button" disabled={busyId === row.id || row.role === 'admin'} onClick={() => void ban(row)}>{row.commentBanned ? 'ปลดแบน' : 'แบนคอมเมนต์'}</button></td></tr>)}</tbody></table></div>;
}

export function AdminCommentsTable({ initialRows }: { initialRows: AdminCommentRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function moderate(row: AdminCommentRow) {
    const restore = row.deletedAt !== null;
    if (!restore && !window.confirm('ลบคอมเมนต์นี้?')) return;
    setBusyId(row.id); setError('');
    try {
      const response = restore ? await actions.admin.comments.restore({ id: row.id }) : await actions.admin.comments.delete({ id: row.id });
      if (response.error) throw new Error(response.error.message);
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, deletedAt: restore ? null : Date.now(), canRestore: true } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'จัดการคอมเมนต์ไม่สำเร็จ'); }
    finally { setBusyId(''); }
  }

  return <div className="table-wrap">{error && <p className="error-text" role="alert">{error}</p>}<table className="data-table"><thead><tr><th>คอมเมนต์</th><th>ผู้เขียน</th><th>รายการ</th><th>วันที่</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="comment-cell">{row.body}</td><td>{row.authorName}<small className="muted block">{row.authorEmail}</small></td><td>{row.targetUrl ? <a href={row.targetUrl}>{row.targetTitle}</a> : row.targetTitle || '—'}</td><td>{dateFormat.format(row.createdAt)}</td><td>{row.deletedAt ? 'ลบแล้ว' : 'เผยแพร่'}</td><td><button className="button" type="button" disabled={busyId === row.id || (row.deletedAt !== null && !row.canRestore)} onClick={() => void moderate(row)}>{row.deletedAt ? 'กู้คืน' : 'ลบ'}</button></td></tr>)}</tbody></table></div>;
}
