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
