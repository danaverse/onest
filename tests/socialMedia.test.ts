import {
  MAX_MEDIA_BYTES,
  normalizeComment,
  sniffImageMime,
} from '../src/social/media.js';

function bytes(...values: number[]): Uint8Array {
  const out = new Uint8Array(32);
  values.forEach((v, i) => {
    out[i] = v;
  });
  return out;
}

describe('media sniffing', () => {
  it('detects jpeg, png and webp magic bytes', () => {
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      'image/png',
    );
    expect(
      sniffImageMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)),
    ).toBe('image/webp');
  });

  it('rejects unknown and tiny payloads', () => {
    expect(sniffImageMime(new TextEncoder().encode('<html>not an image</html>'))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('caps media size at 2 MiB', () => {
    expect(MAX_MEDIA_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe('comment validation', () => {
  it('trims and accepts normal comments', () => {
    expect(normalizeComment('  So sorry for your loss  ')).toEqual({
      ok: true,
      body: 'So sorry for your loss',
    });
  });

  it('rejects empty and oversized comments', () => {
    expect(normalizeComment('   ').ok).toBe(false);
    expect(normalizeComment('x'.repeat(301)).ok).toBe(false);
  });
});
