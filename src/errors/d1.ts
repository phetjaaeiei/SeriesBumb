// D1's free-tier counters reset at 00:00 UTC (07:00 in Thailand), matching the 503 page.
export const D1_QUOTA_MESSAGE = 'ระบบใช้โควตาฐานข้อมูลประจำวันครบแล้ว กลับมาใช้ได้ 07:00 น.';

const DAILY_ROW_LIMIT = /D1's free tier daily row (?:read|write) limit/i;

export function isD1QuotaError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current = err;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ('message' in current && typeof current.message === 'string' && DAILY_ROW_LIMIT.test(current.message)) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
