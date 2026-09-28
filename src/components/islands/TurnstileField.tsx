/** @jsxRuntime classic */
import React, { useEffect, useRef } from 'react';
import { renderTurnstile } from '../../lib/client/turnstile';

/** Renders nothing unless Turnstile is configured; `resetKey` changes re-issue a fresh token after each submit. */
export function TurnstileField({ siteKey, onToken, resetKey = 0 }: { siteKey: string | null | undefined; onToken: (token: string | null) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    onToken(null);
    renderTurnstile(ref.current, siteKey, onToken).then((widget) => { if (cancelled) widget.remove(); else cleanup = widget.remove; }).catch(() => onToken(null));
    return () => { cancelled = true; cleanup?.(); };
    // onToken is a stable state setter at every call site, so it is not a dependency.
  }, [siteKey, resetKey]);
  return siteKey ? <div ref={ref} className="turnstile-field" /> : null;
}
