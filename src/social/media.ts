/**
 * Media validation shared by upload + post creation.
 * Object key is sha256(bytes); stored mime is sniffed, never trusted from the client.
 */

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const MAX_MEDIA_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MIN_MEDIA_BYTES = 24;

export const COMMENT_MAX_CHARS = 300;
export const COMMENT_MAX_BYTES = 1200;
export const MAX_COMMENTS_PER_POST_PER_DAY = 50;

export function isAllowedImageMime(raw: string | null | undefined): raw is AllowedImageMime {
  const m = String(raw || '').trim().toLowerCase();
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(m);
}

export function sniffImageMime(bytes: Uint8Array): AllowedImageMime | null {
  if (bytes.length < MIN_MEDIA_BYTES) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: RIFF .... WEBP
  if (
    bytes.length >= 16 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function normalizeComment(
  raw: string | null | undefined,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = String(raw ?? '').replaceAll('\u001f', ' ').trim();
  if (!body) return { ok: false, error: 'comment required' };
  if (body.length > COMMENT_MAX_CHARS) {
    return { ok: false, error: `comment exceeds ${COMMENT_MAX_CHARS} characters` };
  }
  if (new TextEncoder().encode(body).length > COMMENT_MAX_BYTES) {
    return { ok: false, error: `comment exceeds ${COMMENT_MAX_BYTES} bytes` };
  }
  return { ok: true, body };
}
