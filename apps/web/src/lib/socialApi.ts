/**
 * Social API client — dana-index hosted posts, media and comments.
 * Votes go through the mint-api offer flow (see offerRunner.ts).
 */
import { DANA_INDEX_BASE, getOrCreateInstallId } from './config.js';

export interface FeedMedia {
  sha256: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  position: number;
}

export interface PetInfo {
  name: string;
  species: string;
}

/** Off-chain avatar/banner keys for a pet profile root. */
export interface ProfileMediaLinks {
  avatar: string | null;
  banner: string | null;
}

export interface FeedPost {
  id: string;
  petRootTxid: string;
  authorInstall: string;
  authorAddress: string | null;
  caption: string;
  status: 'pending' | 'verified' | 'removed';
  createdAt: number;
  anchoredAt: number | null;
  anchorTxid: string | null;
  upvoteAtoms: number;
  downvoteAtoms: number;
  media: FeedMedia[];
  /** Pet profile the post belongs to (enriched by the indexer). */
  pet?: PetInfo | null;
}

export interface PostComment {
  id: string;
  postId: string;
  authorInstall: string;
  authorAddress: string | null;
  body: string;
  createdAt: number;
}

export interface FeedPage {
  posts: FeedPost[];
  next: { beforeCreatedAt: number; beforeId: string } | null;
}

const MAX_IMAGE_DIM = 1600;
const JPEG_QUALITY = 0.82;

function apiBase(): string {
  return DANA_INDEX_BASE || '/index-api';
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  return new Error((body as { error?: string }).error || `${fallback} HTTP ${res.status}`);
}

export function mediaUrl(sha256: string): string {
  return `${apiBase()}/media/${sha256}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer);
  let out = '';
  for (const b of new Uint8Array(digest)) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/** Downscale + recompress photos client-side; falls back to the original. */
async function redrawImage(
  file: File,
  opts: { maxDim: number; square?: boolean },
): Promise<{ blob: Blob; mime: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Please choose a JPEG, PNG or WebP image');
  }
  try {
    const bitmap = await createImageBitmap(file);
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (opts.square) {
      const side = Math.min(bitmap.width, bitmap.height);
      sx = Math.round((bitmap.width - side) / 2);
      sy = Math.round((bitmap.height - side) / 2);
      sw = side;
      sh = side;
    }
    const scale = Math.min(1, opts.maxDim / Math.max(sw, sh));
    const width = Math.max(1, Math.round(sw * scale));
    const height = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, mime: file.type };
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) return { blob: file, mime: file.type };
    if (blob.size >= file.size && file.type === 'image/jpeg') {
      return { blob: file, mime: file.type };
    }
    return { blob, mime: blob.type || 'image/jpeg' };
  } catch {
    return { blob: file, mime: file.type };
  }
}

/** Downscale + recompress photos client-side; falls back to the original. */
export function compressImage(file: File): Promise<{ blob: Blob; mime: string }> {
  return redrawImage(file, { maxDim: MAX_IMAGE_DIM });
}

/** Square center-crop, for profile avatars. */
export function compressAvatar(file: File): Promise<{ blob: Blob; mime: string }> {
  return redrawImage(file, { maxDim: 512, square: true });
}

/** Wide artwork, for profile banners. */
export function compressBanner(file: File): Promise<{ blob: Blob; mime: string }> {
  return redrawImage(file, { maxDim: 1600 });
}

export async function uploadImage(
  blob: Blob,
): Promise<{ sha256: string; mime: string; bytes: number }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const installId = getOrCreateInstallId();
  const res = await fetch(
    `${apiBase()}/api/media/${sha256}?installId=${encodeURIComponent(installId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    },
  );
  if (!res.ok) throw await errorFrom(res, 'Upload');
  return res.json();
}

export async function fetchProfileMedia(
  petRootTxid: string,
): Promise<ProfileMediaLinks | null> {
  const res = await fetch(
    `${apiBase()}/api/pets/${encodeURIComponent(petRootTxid)}/media`,
  );
  if (!res.ok) throw await errorFrom(res, 'Profile media');
  const data = await res.json();
  return data.media ?? null;
}

async function postProfileMedia(
  petRootTxid: string,
  links: { avatar?: string | null; banner?: string | null },
): Promise<ProfileMediaLinks> {
  const installId = getOrCreateInstallId();
  const res = await fetch(
    `${apiBase()}/api/pets/${encodeURIComponent(petRootTxid)}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installId,
        ...(links.avatar !== undefined ? { avatarSha256: links.avatar } : {}),
        ...(links.banner !== undefined ? { bannerSha256: links.banner } : {}),
      }),
    },
  );
  if (!res.ok) throw await errorFrom(res, 'Profile media');
  const data = await res.json();
  return data.media as ProfileMediaLinks;
}

/**
 * Link uploaded artwork to a freshly created profile. The burn may still be
 * propagating, so retry 404/403 for a while before giving up.
 */
export async function associateProfileMedia(
  petRootTxid: string,
  links: { avatar?: string | null; banner?: string | null },
  opts?: { attempts?: number; intervalMs?: number },
): Promise<ProfileMediaLinks> {
  const attempts = opts?.attempts ?? 12;
  const intervalMs = opts?.intervalMs ?? 2_500;
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await postProfileMedia(petRootTxid, links);
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Profile media failed');
}

const PENDING_PROFILE_MEDIA_KEY = 'onest.pendingProfileMedia';

export interface PendingProfileMedia {
  txid: string;
  avatar?: string | null;
  banner?: string | null;
}

function readPendingProfileMedia(): PendingProfileMedia[] {
  try {
    const raw = localStorage.getItem(PENDING_PROFILE_MEDIA_KEY)?.trim() || '';
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingProfileMedia[];
    return Array.isArray(parsed)
      ? parsed.filter(
          p => p && /^[0-9a-f]{64}$/i.test(String(p.txid || '')),
        )
      : [];
  } catch {
    return [];
  }
}

function writePendingProfileMedia(items: PendingProfileMedia[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(PENDING_PROFILE_MEDIA_KEY);
    else localStorage.setItem(PENDING_PROFILE_MEDIA_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota / private mode */
  }
}

export function queueProfileMedia(item: PendingProfileMedia): void {
  const items = readPendingProfileMedia().filter(
    p => p.txid.toLowerCase() !== item.txid.toLowerCase(),
  );
  items.push({ ...item, txid: item.txid.toLowerCase() });
  writePendingProfileMedia(items);
}

/** Retry artwork links that were queued when the index was slow. */
export async function flushPendingProfileMedia(): Promise<number> {
  const items = readPendingProfileMedia();
  if (items.length === 0) return 0;
  const remaining: PendingProfileMedia[] = [];
  let linked = 0;
  for (const item of items) {
    try {
      await postProfileMedia(item.txid, {
        ...(item.avatar !== undefined ? { avatar: item.avatar } : {}),
        ...(item.banner !== undefined ? { banner: item.banner } : {}),
      });
      linked++;
    } catch {
      remaining.push(item);
    }
  }
  writePendingProfileMedia(remaining);
  return linked;
}

export async function createPost(input: {
  petRootTxid: string;
  caption: string;
  mediaHashes: string[];
  createdAt: number;
}): Promise<{ id: string; contentHash: string; status: string }> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${apiBase()}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installId, ...input }),
  });
  if (!res.ok) throw await errorFrom(res, 'Create post');
  return res.json();
}

export async function fetchFeed(
  limit = 20,
  cursor?: { beforeCreatedAt: number; beforeId: string } | null,
): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set('beforeCreatedAt', String(cursor.beforeCreatedAt));
    params.set('beforeId', cursor.beforeId);
  }
  const res = await fetch(`${apiBase()}/api/feed?${params.toString()}`);
  if (!res.ok) throw await errorFrom(res, 'Feed');
  return res.json();
}

export interface MyPetSummary {
  txid: string;
  name: string;
  species: string;
  avatar: string | null;
  tributes: number;
  at: string;
}

/** Pet profiles created by this wallet/install (desk- or wallet-paid). */
export async function fetchMyPets(
  address: string,
  installId?: string,
): Promise<MyPetSummary[]> {
  const params = new URLSearchParams();
  if (address) params.set('address', address);
  if (installId) params.set('installId', installId);
  const res = await fetch(`${apiBase()}/api/pets?${params.toString()}`);
  if (!res.ok) throw await errorFrom(res, 'My pets');
  const data = await res.json();
  return data.pets ?? [];
}

export async function fetchPetPosts(
  petRootTxid: string,
  limit = 30,
): Promise<FeedPost[]> {
  const res = await fetch(
    `${apiBase()}/api/pets/${encodeURIComponent(petRootTxid)}/posts?limit=${limit}`,
  );
  if (!res.ok) throw await errorFrom(res, 'Pet posts');
  const data = await res.json();
  return data.posts ?? [];
}

export async function fetchTrendingPosts(limit = 6): Promise<FeedPost[]> {
  const res = await fetch(`${apiBase()}/api/feed/trending?limit=${limit}`);
  if (!res.ok) throw await errorFrom(res, 'Trending');
  const data = await res.json();
  return data.posts ?? [];
}

export async function fetchPost(
  id: string,
): Promise<{ post: FeedPost; comments: PostComment[] }> {
  const res = await fetch(`${apiBase()}/api/posts/${encodeURIComponent(id)}`);
  if (!res.ok) throw await errorFrom(res, 'Post');
  return res.json();
}

export async function addComment(
  postId: string,
  body: string,
): Promise<PostComment> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${apiBase()}/api/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installId, body }),
  });
  if (!res.ok) throw await errorFrom(res, 'Comment');
  const data = await res.json();
  return data.comment;
}

export async function bindUserProfile(input: {
  installId: string;
  address: string;
  message: string;
  signature: string;
}): Promise<{ installId: string; address: string }> {
  const res = await fetch(`${apiBase()}/api/users/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await errorFrom(res, 'Bind user profile');
  const data = await res.json();
  return data.user;
}

export async function fetchUserProfile(
  installId: string,
): Promise<{ installId: string; address: string } | null> {
  const res = await fetch(`${apiBase()}/api/users/${encodeURIComponent(installId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await errorFrom(res, 'User profile');
  const data = await res.json();
  return data.user ?? null;
}

export async function removePost(postId: string): Promise<void> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${apiBase()}/api/posts/${encodeURIComponent(postId)}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installId }),
  });
  if (!res.ok) throw await errorFrom(res, 'Remove post');
}

export async function removeComment(commentId: string): Promise<void> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${apiBase()}/api/comments/${encodeURIComponent(commentId)}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installId }),
  });
  if (!res.ok) throw await errorFrom(res, 'Remove comment');
}

/** Poll until the v4 stamp is verified by the indexer. */
export async function pollPostVerified(
  id: string,
  timeoutMs = 25_000,
  intervalMs = 1500,
): Promise<FeedPost | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const { post } = await fetchPost(id);
      if (post.status === 'verified') return post;
    } catch {
      /* keep polling until deadline */
    }
    if (Date.now() >= deadline) return null;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

export function isOwnPost(post: FeedPost): boolean {
  try {
    return post.authorInstall === getOrCreateInstallId();
  } catch {
    return false;
  }
}

export function isOwnComment(comment: PostComment): boolean {
  try {
    return comment.authorInstall === getOrCreateInstallId();
  } catch {
    return false;
  }
}
