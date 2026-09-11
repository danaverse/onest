#!/usr/bin/env tsx
/**
 * Onest DANA Index server — Chronik-backed public history of PAW animal
 * memorials plus the social feed (posts, votes, comments, media).
 *
 *   GET  /health
 *   GET  /api/recent?limit=40
 *   GET  /api/trending?limit=8
 *   GET  /api/search?q=&limit=20
 *   GET  /api/memorial/:txid
 *   GET  /og/:txid
 *   GET  /:txid
 *   GET  /api/feed?limit=&beforeCreatedAt=&beforeId=&q=
 *   GET  /api/feed/trending?limit=
 *   GET  /api/posts/:id
 *   GET  /api/pets/:txid/posts
 *   PUT  /api/media/:sha256?installId=
 *   GET  /media/:sha256
 *   POST /api/posts
 *   POST /api/posts/:id/comments
 *   POST /api/posts/:id/remove
 *   POST /api/comments/:id/remove
 *   POST /api/notify { burnTxid, installId? }
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { verifyMsg } from 'ecash-lib';
import { userBindMessage } from '../../../src/wallet/bindMessage.js';
import {
  parseAnimalProfileNote,
  profileBareNameFromNote,
} from '../../../src/offering/animalProfileFields.js';
import {
  createIngestChronik,
  ingestTxid,
  syncTokenHistory,
} from './ingest.js';
import { buildOgHtml, resolveOgLocale } from './ogPreview.js';
import { BurnStore, TRENDING_GRAVITY } from './store.js';
import { openSocialDb } from './social/db.js';
import { SocialStore } from './social/socialStore.js';
import { MediaStore } from './social/mediaStore.js';
import {
  computePostContentHash,
  validatePostContentInput,
} from '../../../src/social/contentHash.js';
import { MAX_MEDIA_BYTES, normalizeComment } from '../../../src/social/media.js';
import { isHex64, normalizeHex64 } from '../../../src/social/danaSocial.js';
import {
  readJsonBody,
  readRawBody,
  PayloadTooLargeError,
} from '../../../src/lib/httpJson.js';
import { allowIndexNotify } from '../../../src/lib/indexNotifyAuth.js';
import {
  createDailyCounter,
  createRollingWindowCounter,
  normalizeClientIp,
} from '../../../src/lib/rateLimit.js';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: process.env.ONEST_DANA_INDEX_ENV ?? '/etc/onest/dana-index.env', override: true });

function resolveTokenId(): string {
  const envId =
    process.env.TOKEN_ID?.trim() ||
    process.env.VITE_PAW_TOKEN_ID?.trim() ||
    process.env.VITE_PRAYER_TOKEN_ID?.trim();
  if (envId) return envId;
  const depPaths = [
    process.env.DEPLOYMENT_JSON?.trim(),
    'deployments/mainnet-paw.json',
    'deployments/test-paw.json',
  ].filter(Boolean) as string[];
  for (const p of depPaths) {
    const full = resolve(process.cwd(), p);
    if (existsSync(full)) {
      try {
        const dep = JSON.parse(readFileSync(full, 'utf8'));
        if (dep.tokenId) return dep.tokenId;
      } catch {
        /* ignore */
      }
    }
  }
  return '';
}

const PORT = Number(process.env.DANA_INDEX_PORT?.trim() || 8788);
const TOKEN_ID = resolveTokenId();
const STORE_PATH =
  process.env.DANA_INDEX_STORE?.trim() ||
  resolve(process.cwd(), 'data/dana-index-burns.json');
const SOCIAL_DB_PATH =
  process.env.ONEST_SOCIAL_DB?.trim() ||
  resolve(process.cwd(), 'data/onest-social.sqlite');
const MEDIA_DIR =
  process.env.ONEST_MEDIA_DIR?.trim() ||
  resolve(process.cwd(), 'data/media');
const POLL_MS = Math.max(
  5_000,
  Number(process.env.DANA_INDEX_POLL_MS?.trim() || 30_000),
);
const SITE_ORIGIN = (
  process.env.PUBLIC_SITE_ORIGIN?.trim() ||
  process.env.VITE_PUBLIC_SITE_ORIGIN?.trim() ||
  'https://onest.pet'
).replace(/\/$/, '');
const STARTED_AT = new Date().toISOString();
const NOTIFY_SECRET = process.env.DANA_INDEX_NOTIFY_SECRET?.trim() || '';

const MAX_POSTS_PER_DAY = Math.max(
  1,
  Number(process.env.ONEST_MAX_POSTS_PER_DAY?.trim() || 10) || 10,
);
const MAX_COMMENTS_PER_DAY = Math.max(
  1,
  Number(process.env.ONEST_MAX_COMMENTS_PER_DAY?.trim() || 50) || 50,
);
const MAX_UPLOADS_PER_DAY = Math.max(
  1,
  Number(process.env.ONEST_MAX_UPLOADS_PER_DAY?.trim() || 40) || 40,
);
const MAX_WRITES_PER_IP_PER_MIN = Math.max(
  1,
  Number(process.env.ONEST_MAX_WRITES_PER_IP_PER_MIN?.trim() || 60) || 60,
);

const store = new BurnStore(STORE_PATH);
const { sqlite, db } = openSocialDb(SOCIAL_DB_PATH);
const social = new SocialStore(sqlite, db);
const mediaStore = new MediaStore(MEDIA_DIR);
const chronik = createIngestChronik();

const postsPerDay = createDailyCounter(
  MAX_POSTS_PER_DAY,
  n => `Daily post limit reached (${n} per day).`,
);
const commentsPerDay = createDailyCounter(
  MAX_COMMENTS_PER_DAY,
  n => `Daily comment limit reached (${n} per day).`,
);
const uploadsPerDay = createDailyCounter(
  MAX_UPLOADS_PER_DAY,
  n => `Daily upload limit reached (${n} per day).`,
);
const writesPerIpPerMin = createRollingWindowCounter(
  MAX_WRITES_PER_IP_PER_MIN,
  60_000,
  n => `Too many writes from this network (${n}/min). Try again shortly.`,
);

function cors(res: import('node:http').ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Onest-Install-Id');
}

function json(
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown,
): void {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function html(
  res: import('node:http').ServerResponse,
  status: number,
  body: string,
): void {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

class BadRequestError extends Error {}

/** Attach the pet profile (name/species) a post belongs to, when indexed. */
function petInfoFor(
  rootTxid: string,
): { name: string; species: string } | null {
  const item = store.get(rootTxid);
  if (!item?.note) return null;
  const parsed = parseAnimalProfileNote(item.note);
  return {
    name: profileBareNameFromNote(item.note) || '',
    species: parsed?.species || '',
  };
}

function withPetInfo<T extends { petRootTxid: string }>(
  posts: T[],
): Array<T & { pet: { name: string; species: string } | null }> {
  return posts.map(p => ({ ...p, pet: petInfoFor(p.petRootTxid) }));
}

function requireInstallId(raw: unknown): string {
  const installId = String(raw || '').trim();
  if (!installId || installId.length < 8 || installId.length > 128) {
    throw new BadRequestError('installId required (8–128 chars)');
  }
  return installId;
}

function clientIp(req: import('node:http').IncomingMessage): string {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded;
  if (Array.isArray(forwarded) && forwarded.length) return forwarded[0]!;
  return req.socket.remoteAddress ?? 'unknown';
}

function mediaHeaders(mime: string, bytes: number): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': mime,
    'Content-Length': String(bytes),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

  try {
    const normPath = url.pathname.startsWith('/index-api/')
      ? url.pathname.slice('/index-api'.length)
      : url.pathname === '/index-api'
        ? '/'
        : url.pathname;

    if (req.method === 'GET' && (normPath === '/health' || url.pathname === '/health')) {
      json(res, 200, {
        ok: true,
        service: 'onest-dana-index',
        startedAt: STARTED_AT,
        tokenId: TOKEN_ID || null,
        totalBurns: store.recent(1).length ? store.groups().length : 0,
        totalPosts: social.countPosts(),
        ingestCursor: social.getIngestCursor(),
      });
      return;
    }

    // ------------------------------------------------------------- memories

    if (req.method === 'GET' && normPath === '/api/recent') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 40)));
      json(res, 200, { ok: true, burns: store.recent(limit) });
      return;
    }

    if (req.method === 'GET' && normPath === '/api/trending') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 8)));
      json(res, 200, {
        ok: true,
        gravity: TRENDING_GRAVITY,
        trending: store.trending(limit),
      });
      return;
    }

    if (req.method === 'GET' && normPath === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
      json(res, 200, { ok: true, results: store.search(q, limit) });
      return;
    }

    if (req.method === 'GET' && (normPath.startsWith('/api/memorial/') || normPath.startsWith('/api/memory/'))) {
      const txid = (normPath.startsWith('/api/memorial/')
        ? normPath.slice('/api/memorial/'.length)
        : normPath.slice('/api/memory/'.length)
      ).trim().toLowerCase();
      const group = store.groupForRoot(txid);
      if (!group) {
        json(res, 404, { error: 'memory not found' });
        return;
      }
      json(res, 200, { ok: true, memory: group, memorial: group });
      return;
    }

    // ------------------------------------------------------------- users

    if (req.method === 'POST' && normPath === '/api/users/bind') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      writesPerIpPerMin.consume(normalizeClientIp(clientIp(req)));
      const address = String(body.address || '').trim();
      const signature = String(body.signature || '').trim();
      if (!address || !signature) {
        json(res, 400, { error: 'address and signature required' });
        return;
      }
      let verified = false;
      try {
        verified = verifyMsg(userBindMessage(installId), signature, address);
      } catch {
        verified = false;
      }
      if (!verified) {
        json(res, 403, { error: 'signature does not match address' });
        return;
      }
      const user = social.bindUser({ installId, address });
      json(res, 200, { ok: true, user });
      return;
    }

    if (req.method === 'GET' && normPath.startsWith('/api/users/')) {
      const installId = decodeURIComponent(
        normPath.slice('/api/users/'.length),
      ).trim();
      if (!installId) {
        json(res, 400, { error: 'installId required' });
        return;
      }
      const user = social.getUser(installId);
      if (!user) {
        json(res, 404, { error: 'user not found' });
        return;
      }
      json(res, 200, { ok: true, user });
      return;
    }

    // ------------------------------------------------------------- social feed

    if (req.method === 'GET' && normPath === '/api/feed/trending') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
      json(res, 200, { ok: true, posts: withPetInfo(social.listTrending(14, limit)) });
      return;
    }

    if (req.method === 'GET' && normPath === '/api/feed') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
      const beforeCreatedAt = Number(url.searchParams.get('beforeCreatedAt') || 0);
      const beforeId = normalizeHex64(url.searchParams.get('beforeId'));
      const q = (url.searchParams.get('q') || '').trim();
      const posts = withPetInfo(
        social.listFeed({
          limit,
          beforeCreatedAt: beforeCreatedAt > 0 ? beforeCreatedAt : undefined,
          beforeId: beforeId ?? undefined,
          q: q || undefined,
        }),
      );
      const last = posts[posts.length - 1];
      json(res, 200, {
        ok: true,
        posts,
        next:
          posts.length === limit && last
            ? { beforeCreatedAt: last.createdAt, beforeId: last.id }
            : null,
      });
      return;
    }

    if (req.method === 'GET' && normPath.startsWith('/api/posts/')) {
      const postId = normalizeHex64(normPath.slice('/api/posts/'.length));
      if (!postId) {
        json(res, 400, { error: 'valid post id required' });
        return;
      }
      const post = social.getPost(postId);
      if (!post) {
        json(res, 404, { error: 'post not found' });
        return;
      }
      json(res, 200, {
        ok: true,
        post: withPetInfo([post])[0],
        comments: social.listComments(postId, 100),
      });
      return;
    }

    if (req.method === 'GET' && normPath.startsWith('/api/pets/')) {
      const rest = normPath.slice('/api/pets/'.length);
      const rootTxid = normalizeHex64(rest.replace(/\/posts$/, ''));
      if (!rootTxid) {
        json(res, 400, { error: 'valid pet root txid required' });
        return;
      }
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
      json(res, 200, { ok: true, posts: withPetInfo(social.listByPetRoot(rootTxid, limit)) });
      return;
    }

    // ------------------------------------------------------------- media

    if (req.method === 'GET' && normPath.startsWith('/media/')) {
      const sha = normPath.slice('/media/'.length).trim().toLowerCase();
      if (!isHex64(sha)) {
        json(res, 400, { error: 'valid sha256 required' });
        return;
      }
      const meta = social.getMedia(sha);
      const bytes = mediaStore.read(sha);
      if (!meta || !bytes) {
        json(res, 404, { error: 'media not found' });
        return;
      }
      res.writeHead(200, mediaHeaders(meta.mime, bytes.length));
      res.end(bytes);
      return;
    }

    if (req.method === 'PUT' && normPath.startsWith('/api/media/')) {
      const sha = normPath.slice('/api/media/'.length).trim().toLowerCase();
      if (!isHex64(sha)) {
        json(res, 400, { error: 'valid sha256 key required' });
        return;
      }
      const installId = requireInstallId(
        url.searchParams.get('installId') || req.headers['x-onest-install-id'],
      );
      uploadsPerDay.consume(installId);
      writesPerIpPerMin.consume(normalizeClientIp(clientIp(req)));

      const body = await readRawBody(req, MAX_MEDIA_BYTES + 1);
      let stored;
      try {
        stored = mediaStore.put(body, sha);
      } catch (e) {
        json(res, 400, { error: e instanceof Error ? e.message : 'invalid media' });
        return;
      }
      social.insertMedia({
        sha256: stored.sha256,
        mime: stored.mime,
        bytes: stored.bytes,
        objectKey: stored.sha256,
        createdAt: Date.now(),
      });
      json(res, 200, { ok: true, ...stored });
      return;
    }

    // ------------------------------------------------------------- posts

    if (req.method === 'POST' && normPath === '/api/posts') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      postsPerDay.consume(installId);
      writesPerIpPerMin.consume(normalizeClientIp(clientIp(req)));

      const mediaHashes = Array.isArray(body.mediaHashes)
        ? body.mediaHashes.map(v => String(v))
        : [];
      const check = validatePostContentInput({
        caption: typeof body.caption === 'string' ? body.caption : '',
        mediaHashes,
        petRootTxid: typeof body.petRootTxid === 'string' ? body.petRootTxid : '',
        author: installId,
        createdAt: Number(body.createdAt),
      });
      if (!check.ok) {
        json(res, 400, { error: check.error });
        return;
      }

      const id = await computePostContentHash({
        caption: check.value.caption,
        mediaHashes: check.value.mediaHashes,
        petRootTxid: check.value.petRootTxid,
        author: installId,
        createdAt: check.value.createdAt,
      });
      const provided = normalizeHex64(
        typeof body.contentHash === 'string' ? body.contentHash : '',
      );
      if (provided && provided !== id) {
        json(res, 400, { error: 'contentHash does not match hosted fields' });
        return;
      }
      for (const sha of check.value.mediaHashes) {
        if (!social.mediaExists(sha)) {
          json(res, 400, { error: `media not uploaded: ${sha}` });
          return;
        }
      }

      const authorAddress =
        typeof body.authorAddress === 'string' && body.authorAddress.trim()
          ? body.authorAddress.trim().slice(0, 128)
          : null;
      const created = social.createPost({
        id,
        petRootTxid: check.value.petRootTxid,
        authorInstall: installId,
        authorAddress,
        caption: check.value.caption,
        createdAt: check.value.createdAt,
        mediaHashes: check.value.mediaHashes,
      });
      if (!created.ok) {
        json(res, 409, { error: 'post already exists' });
        return;
      }
      json(res, 200, {
        ok: true,
        id,
        contentHash: id,
        status: 'pending',
        media: check.value.mediaHashes,
      });
      return;
    }

    if (req.method === 'POST' && /^\/api\/posts\/[0-9a-fA-F]{64}\/comments$/.test(normPath)) {
      const postId = normPath.split('/')[3]!.toLowerCase();
      if (!social.postExists(postId)) {
        json(res, 404, { error: 'post not found' });
        return;
      }
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      commentsPerDay.consume(installId);
      writesPerIpPerMin.consume(normalizeClientIp(clientIp(req)));
      const check = normalizeComment(typeof body.body === 'string' ? body.body : '');
      if (!check.ok) {
        json(res, 400, { error: check.error });
        return;
      }
      const comment = social.addComment({
        id: randomUUID(),
        postId,
        authorInstall: installId,
        authorAddress:
          typeof body.authorAddress === 'string' && body.authorAddress.trim()
            ? body.authorAddress.trim().slice(0, 128)
            : null,
        body: check.body,
        createdAt: Date.now(),
      });
      json(res, 200, { ok: true, comment });
      return;
    }

    if (req.method === 'POST' && /^\/api\/posts\/[0-9a-fA-F]{64}\/remove$/.test(normPath)) {
      const postId = normPath.split('/')[3]!.toLowerCase();
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const removed = social.removePost(postId, installId);
      json(res, removed ? 200 : 403, removed ? { ok: true } : { error: 'not the author' });
      return;
    }

    if (req.method === 'POST' && /^\/api\/comments\/[0-9a-fA-F-]{36}\/remove$/.test(normPath)) {
      const commentId = normPath.split('/')[3]!.toLowerCase();
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const removed = social.removeComment(commentId, installId);
      json(res, removed ? 200 : 403, removed ? { ok: true } : { error: 'not the author' });
      return;
    }

    // ------------------------------------------------------------- OG + notify

    if (req.method === 'GET' && (normPath.startsWith('/og/') || /^\/[0-9a-fA-F]{64}$/.test(normPath))) {
      const txid = normPath.replace(/^\/og\//, '').replace(/^\//, '').trim().toLowerCase();
      const item = store.get(txid);
      const note = item ? item.note : '';
      const locale = resolveOgLocale({
        langParam: url.searchParams.get('lang'),
        acceptLanguage: req.headers['accept-language'],
      });
      const ogHtml = buildOgHtml({
        burnTxid: txid,
        note,
        siteOrigin: SITE_ORIGIN,
        locale,
      });
      html(res, 200, ogHtml);
      return;
    }

    if (req.method === 'POST' && (normPath === '/api/notify' || url.pathname === '/api/notify')) {
      if (!allowIndexNotify(req, NOTIFY_SECRET)) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      const body = await readJsonBody(req);
      const txid = String(body.burnTxid || '').trim().toLowerCase();
      if (!txid || !/^[0-9a-fA-F]{64}$/.test(txid)) {
        json(res, 400, { error: 'valid burnTxid required' });
        return;
      }
      const voterInstall =
        typeof body.installId === 'string' ? body.installId.trim() : null;
      if (TOKEN_ID) {
        void ingestTxid(chronik, store, social, txid, TOKEN_ID, { voterInstall });
      }
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      e instanceof PayloadTooLargeError
        ? 413
        : e instanceof BadRequestError
          ? 400
          : 500;
    json(res, status, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`Onest dana-index listening on :${PORT} startedAt=${STARTED_AT}`);
  if (TOKEN_ID && /^[0-9a-fA-F]{64}$/.test(TOKEN_ID)) {
    void syncTokenHistory(chronik, TOKEN_ID, store, social)
      .then(r => console.log('initial sync', r))
      .catch(console.warn);
    setInterval(() => {
      void syncTokenHistory(chronik, TOKEN_ID, store, social).catch(console.warn);
    }, POLL_MS);
  }
});
