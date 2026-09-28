import { describe, expect, it } from 'vitest';
import { isAdminSurface } from '../../src/lib/admin-surface';

describe('isAdminSurface', () => {
  it.each([
    'https://x.test/admin',
    'https://x.test/admin/tapes',
    'https://x.test/admin/api/audio',
    'https://x.test/_actions/admin.tapes.save/',
    // Form dispatch and nested RPC paths reach admin actions without an /admin or /_actions/admin. prefix.
    'https://x.test/?_action=admin.deleteCatalog',
    'https://x.test/_actions/x/_actions/admin.tapes.save',
  ])('covers %s', (url) => expect(isAdminSurface(new URL(url))).toBe(true));

  it.each(['https://x.test/', 'https://x.test/administrator', 'https://x.test/_actions/comments.create/', 'https://x.test/tapes/a'])('skips %s', (url) => {
    expect(isAdminSurface(new URL(url))).toBe(false);
  });
});
