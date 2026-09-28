import { describe, expect, it } from 'vitest';
import { REAUTH_MESSAGE } from '../../src/lib/admin-session';
import { needsReauth, reauthUrl } from '../../src/lib/client/reauth';

describe('reauth helpers', () => {
  it('sends the admin back to the page they were on', () => {
    expect(reauthUrl({ pathname: '/admin/tapes/abc', search: '?tab=images' })).toBe('/login?reauth=1&next=%2Fadmin%2Ftapes%2Fabc%3Ftab%3Dimages');
    expect(reauthUrl({ pathname: '/admin/users', search: '' })).toBe('/login?reauth=1&next=%2Fadmin%2Fusers');
  });

  it('recognises only the fresh sign-in error', () => {
    expect(needsReauth(REAUTH_MESSAGE)).toBe(true);
    expect(needsReauth('หน้านี้สำหรับแอดมิน')).toBe(false);
  });
});
