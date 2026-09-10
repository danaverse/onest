/**
 * Hash-keyed media store on local disk.
 * Object key is sha256(bytes); swaps later for presigned R2 PUT with the same key.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  MAX_MEDIA_BYTES,
  MIN_MEDIA_BYTES,
  sniffImageMime,
  type AllowedImageMime,
} from '../../../../src/social/media.js';

export interface StoredMedia {
  sha256: string;
  mime: AllowedImageMime;
  bytes: number;
}

export class MediaStore {
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  pathFor(sha256: string): string {
    return join(this.root, sha256.slice(0, 2), sha256);
  }

  has(sha256: string): boolean {
    return existsSync(this.pathFor(sha256));
  }

  read(sha256: string): Buffer | null {
    const path = this.pathFor(sha256);
    if (!existsSync(path)) return null;
    try {
      return readFileSync(path);
    } catch {
      return null;
    }
  }

  /**
   * Validate + persist bytes under their sha256 key.
   * Throws on size/mime/hash violations.
   */
  put(bytes: Uint8Array, expectedSha256: string): StoredMedia {
    const expected = expectedSha256.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) {
      throw new Error('sha256 must be 64 hex characters');
    }
    if (bytes.length < MIN_MEDIA_BYTES) {
      throw new Error('file too small to be an image');
    }
    if (bytes.length > MAX_MEDIA_BYTES) {
      throw new Error(`file exceeds ${MAX_MEDIA_BYTES} bytes`);
    }
    const mime = sniffImageMime(bytes);
    if (!mime) {
      throw new Error('unsupported image format (jpeg, png, webp only)');
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== expected) {
      throw new Error('content hash does not match sha256 key');
    }

    const path = this.pathFor(sha256);
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
      try {
        writeFileSync(tmp, bytes);
        renameSync(tmp, path);
      } catch (err) {
        try {
          unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        throw err;
      }
    }
    return { sha256, mime, bytes: bytes.length };
  }
}
