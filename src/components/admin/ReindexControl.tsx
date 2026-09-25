/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useState } from 'react';

export default function ReindexControl({ initialPending, initialRebuilding }: { initialPending: number; initialRebuilding: boolean }) {
  const [pending, setPending] = useState(initialPending);
  const [rebuilding, setRebuilding] = useState(initialRebuilding);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function process(rebuild: boolean) {
    if (busy) return;
    if (rebuild && !window.confirm('สร้างดัชนีค้นหาใหม่ทั้งหมด? ระบบจะทำทีละชุด')) return;
    setBusy(true); setMessage('กำลังสร้างดัชนี…');
    try {
      let processed = 0;
      let first = true;
      for (let pass = 0; pass < 200; pass++) {
        const response = rebuild && first ? await actions.admin.search.rebuild({}) : await actions.admin.search.continue({});
        first = false;
        if (response.error || !response.data) throw new Error(response.error?.message || 'สร้างดัชนีไม่สำเร็จ');
        processed += response.data.processed;
        setPending(Math.max(0, response.data.remaining));
        setRebuilding(response.data.rebuilding);
        setMessage(response.data.limited ? `ถึงขีดจำกัดวันนี้แล้ว · ดำเนินการ ${processed.toLocaleString('th-TH')} รายการ` : `ดำเนินการแล้ว ${processed.toLocaleString('th-TH')} รายการ`);
        if (response.data.limited || (!response.data.remaining && !response.data.rebuilding)) break;
      }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'สร้างดัชนีไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  return <div className="reindex-control"><p>คิวดัชนีค้นหา <strong className="mono">{pending.toLocaleString('th-TH')}</strong> รายการ{rebuilding && ' · กำลังสร้างดัชนีใหม่'}</p><div><button className="button button-primary" type="button" disabled={busy || (!pending && !rebuilding)} onClick={() => void process(false)}>{busy ? 'กำลังทำงาน…' : 'ทำต่อ'}</button><button className="button" type="button" disabled={busy} onClick={() => void process(true)}>สร้างดัชนีใหม่ทั้งหมด</button></div>{message && <p className="help-text" role="status">{message}</p>}</div>;
}
