// Server-side Turnstile check. Once the owner configures keys it fails closed:
// a missing, reused or foreign-hostname token never passes.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileCheck {
  secret: string;
  token: string | null | undefined;
  ip: string | null;
  hostname: string;
  /** Accept Cloudflare's published test keys (their answers always name example.com). Never in production. */
  allowTestKeys?: boolean;
  fetcher?: typeof fetch;
}

export async function verifyTurnstile({ secret, token, ip, hostname, allowTestKeys = false, fetcher = fetch }: TurnstileCheck): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const response = await fetcher(SITEVERIFY, { method: 'POST', body: form, redirect: 'manual', signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean; hostname?: string; metadata?: { result_with_testing_key?: boolean } };
    if (result.success !== true) return false;
    if (result.metadata?.result_with_testing_key === true) return allowTestKeys;
    return result.hostname === hostname;
  } catch {
    return false;
  }
}

export const TURNSTILE_FAILED_MESSAGE = 'ยืนยันว่าไม่ใช่บอทไม่สำเร็จ กรุณาลองใหม่';
