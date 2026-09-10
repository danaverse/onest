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
export async function compressImage(
  file: File,
): Promise<{ blob: Blob; mime: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Please choose a JPEG, PNG or WebP image');
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, mime: file.type };
    ctx.drawImage(bitmap, 0, 0, width, height);
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
