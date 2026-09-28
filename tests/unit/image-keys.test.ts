import { describe, expect, it } from 'vitest';
import { assertEntityImageKey } from '../../src/lib/services/image-keys';

const id = '11111111-1111-4111-8111-111111111111';
const uuid = '22222222-2222-4222-8222-222222222222';

describe('assertEntityImageKey', () => {
  it('accepts full and thumb keys inside the entity folder', () => {
    expect(assertEntityImageKey('artists', id, `artists/${id}/${uuid}-full.webp`)).toBe(`artists/${id}/${uuid}-full.webp`);
    expect(assertEntityImageKey('labels', id, `labels/${id}/${uuid}-thumb.jpg`)).toBe(`labels/${id}/${uuid}-thumb.jpg`);
  });

  it('treats empty values as no image', () => {
    expect(assertEntityImageKey('collections', id, '')).toBeNull();
    expect(assertEntityImageKey('collections', id, null)).toBeNull();
    expect(assertEntityImageKey('collections', id, undefined)).toBeNull();
  });

  it.each([
    `tapes/${id}/${uuid}-full.jpg`,
    `artists/33333333-3333-4333-8333-333333333333/${uuid}-full.jpg`,
    `artists/${id}/../${uuid}-full.jpg`,
    `artists/${id}/${uuid}-og.jpg`,
    `artists/${id}/${uuid}-full.png`,
    `https://evil.example/${uuid}-full.jpg`,
  ])('rejects %s', (key) => {
    expect(() => assertEntityImageKey('artists', id, key)).toThrow('รูปนี้ไม่ใช่ของรายการนี้');
  });
});
