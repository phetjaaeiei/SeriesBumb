import { describe, expect, it } from 'vitest';
import { isD1QuotaError } from '../../src/errors/d1';

describe('isD1QuotaError', () => {
  it('recognizes the documented daily row limits in wrapped D1 errors', () => {
    const cause = new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.");
    expect(isD1QuotaError(new Error('Failed query', { cause }))).toBe(true);
    expect(isD1QuotaError(new Error("D1_ERROR: Your account has exceeded D1's free tier daily row write limit."))).toBe(true);
  });

  it('does not treat storage and SQL errors as a temporary daily quota', () => {
    expect(isD1QuotaError(new Error('D1_ERROR: Exceeded maximum DB size.'))).toBe(false);
    expect(isD1QuotaError(new Error('D1_EXEC_ERROR: syntax error'))).toBe(false);
  });
});
