// A stolen admin cookie is worth far less if it dies within a working day and cannot
// delete catalog records or audio, or change who is an admin or banned, without a sign-in
// from the last few minutes. Everyday edits (images, credits, moderation) stay ungated so
// the fresh-sign-in prompt does not become routine; the audit log covers those.
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const FRESH_SESSION_MS = 15 * 60 * 1000;
export const REAUTH_MESSAGE = 'กรุณาเข้าสู่ระบบใหม่เพื่อยืนยันตัวตนก่อนทำรายการนี้';

export function adminSessionExpired(createdAt: Date, now: number): boolean {
  const started = createdAt.getTime();
  return !Number.isFinite(started) || now - started >= ADMIN_SESSION_MAX_AGE_MS;
}

export function isFreshSession(createdAt: Date, now: number): boolean {
  const started = createdAt.getTime();
  return Number.isFinite(started) && now - started < FRESH_SESSION_MS;
}
