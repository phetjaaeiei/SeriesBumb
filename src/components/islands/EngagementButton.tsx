/** @jsxRuntime classic */
import { actions } from 'astro:actions';
import React, { useEffect, useState } from 'react';

type Kind = 'tapeLike' | 'songLike' | 'tapeOwned';
interface Props { kind: Kind; targetId: string; initialValue: boolean; initialCount: number; authenticated: boolean; loginNext: string }

export default function EngagementButton({ kind, targetId, initialValue, initialCount, authenticated, loginNext }: Props) {
  const [value, setValue] = useState(initialValue);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const label = kind === 'tapeOwned' ? 'มีเทปนี้' : 'ถูกใจ';

  async function toggle() {
    if (!authenticated) { window.location.assign(`/login?next=${encodeURIComponent(loginNext)}`); return; }
    if (busy) return;
    const next = !value;
    setValue(next);
    setCount(previous => Math.max(0, previous + (next ? 1 : -1)));
    setBusy(true); setError('');
    try {
      const response = kind === 'tapeLike' ? await actions.engagement.setTapeLike({ tapeId: targetId, liked: next })
        : kind === 'songLike' ? await actions.engagement.setSongLike({ songId: targetId, liked: next })
        : await actions.engagement.setTapeOwned({ tapeId: targetId, owned: next });
      if (response.error || !response.data) throw new Error(response.error?.message || 'บันทึกไม่สำเร็จ');
      setValue(response.data.value);
      setCount(response.data.count);
    } catch {
      setValue(value); setCount(count); setError('บันทึกไม่สำเร็จ ลองอีกครั้ง');
    } finally { setBusy(false); }
  }

  return <span className="engagement-control"><button type="button" className="engagement-button" aria-pressed={value} disabled={!ready || busy} onClick={() => void toggle()}>{label} <strong className="mono">{count.toLocaleString('th-TH')}</strong></button>{error && <span className="error-text" role="alert">{error}</span>}</span>;
}
