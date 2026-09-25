import { describe, expect, it } from 'vitest';
import { sniffImage } from '../../src/lib/services/images';

describe('image magic bytes', () => {
  it('accepts JPEG and WebP signatures', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))?.extension).toBe('jpg');
    expect(sniffImage(new TextEncoder().encode('RIFF1234WEBP'))?.extension).toBe('webp');
  });
  it('rejects file content that only claims an image MIME type', () => {
    expect(sniffImage(new TextEncoder().encode('<script>evil</script>'))).toBeNull();
  });
});
