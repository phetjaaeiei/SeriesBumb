import { describe, expect, it } from 'vitest';
import { BACKUP_EXCLUDED_TABLES, redactBackupValues } from '../../scripts/lib/backup-redaction';

describe('backup redaction', () => {
  it('leaves short-lived auth tables out of every backup', () => {
    expect(BACKUP_EXCLUDED_TABLES).toEqual(['session', 'verification']);
  });

  it('drops provider tokens from account rows and keeps the identity link', () => {
    expect(redactBackupValues('account', {
      id: 'a', providerId: 'google', accountId: 'g-1', accessToken: 't', refreshToken: 'r', idToken: 'i',
      accessTokenExpiresAt: 1, refreshTokenExpiresAt: 2, password: 'p',
    })).toEqual({
      id: 'a', providerId: 'google', accountId: 'g-1', accessToken: null, refreshToken: null, idToken: null,
      accessTokenExpiresAt: null, refreshTokenExpiresAt: null, password: null,
    });
  });

  it('returns other tables unchanged', () => {
    const row = { id: 'x', title: 'เทป' };
    expect(redactBackupValues('tape', row)).toBe(row);
  });
});
