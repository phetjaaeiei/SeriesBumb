// Loads the Turnstile widget script once, only on pages whose form needs it.
interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable')));
    script.onerror = () => { loading = null; reject(new Error('Turnstile unavailable')); };
    document.head.appendChild(script);
  });
  return loading;
}

export interface TurnstileWidget { reset(): void; remove(): void }

/** Renders a widget into `element` and reports tokens (null when expired, failed or reset). */
export async function renderTurnstile(element: HTMLElement, siteKey: string, onToken: (token: string | null) => void): Promise<TurnstileWidget> {
  const api = await loadTurnstile();
  const id = api.render(element, {
    sitekey: siteKey,
    language: 'th',
    callback: (token: string) => onToken(token),
    'expired-callback': () => onToken(null),
    'error-callback': () => onToken(null),
  });
  return {
    reset: () => { onToken(null); api.reset(id); },
    remove: () => api.remove(id),
  };
}
