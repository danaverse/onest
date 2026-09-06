#!/usr/bin/env tsx
/**
 * Onest DANA Index server — Chronik-backed public history of PAW animal memorials.
 *
 *   GET  /health
 *   GET  /api/recent?limit=40
 *   GET  /api/trending?limit=8
 *   GET  /api/search?q=&limit=20
 *   GET  /api/memorial/:txid
 *   GET  /og/:txid
 *   GET  /:txid
 *   POST /api/notify { burnTxid }
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  backfillRecent,
  createIngestChronik,
  ingestTxid,
  ingestUnconfirmed,
} from './ingest.js';
import { buildOgHtml, resolveOgLocale } from './ogPreview.js';
import { BurnStore, TRENDING_GRAVITY } from './store.js';
import { readJsonBody, PayloadTooLargeError } from '../../../src/lib/httpJson.js';
import { allowIndexNotify } from '../../../src/lib/indexNotifyAuth.js';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: process.env.ONEST_DANA_INDEX_ENV ?? '/etc/onest/dana-index.env', override: true });

const PORT = Number(process.env.DANA_INDEX_PORT?.trim() || 8788);
const TOKEN_ID =
  process.env.TOKEN_ID?.trim() ||
  process.env.VITE_PRAYER_TOKEN_ID?.trim() ||
  '';
const STORE_PATH =
  process.env.DANA_INDEX_STORE?.trim() ||
  resolve(process.cwd(), 'data/dana-index-burns.json');
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

const store = new BurnStore(STORE_PATH);
const chronik = createIngestChronik();

function cors(res: import('node:http').ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
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

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, {
        ok: true,
        service: 'onest-dana-index',
        startedAt: STARTED_AT,
        tokenId: TOKEN_ID || null,
        totalBurns: store.recent(1).length ? store.groups().length : 0,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/recent') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 40)));
      json(res, 200, { ok: true, burns: store.recent(limit) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/trending') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 8)));
      json(res, 200, {
        ok: true,
        gravity: TRENDING_GRAVITY,
        trending: store.trending(limit),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
      json(res, 200, { ok: true, results: store.search(q, limit) });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/memorial/')) {
      const txid = url.pathname.slice('/api/memorial/'.length).trim().toLowerCase();
      const group = store.groupForRoot(txid);
      if (!group) {
        json(res, 404, { error: 'memorial not found' });
        return;
      }
      json(res, 200, { ok: true, memorial: group });
      return;
    }

    if (req.method === 'GET' && (url.pathname.startsWith('/og/') || /^\/[0-9a-fA-F]{64}$/.test(url.pathname))) {
      const txid = url.pathname.replace(/^\/og\//, '').replace(/^\//, '').trim().toLowerCase();
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

    if (req.method === 'POST' && url.pathname === '/api/notify') {
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
      if (TOKEN_ID) {
        void ingestTxid(chronik, store, txid, TOKEN_ID);
      }
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof PayloadTooLargeError ? 413 : 500;
    json(res, status, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`Onest dana-index listening on :${PORT} startedAt=${STARTED_AT}`);
  if (TOKEN_ID && /^[0-9a-fA-F]{64}$/.test(TOKEN_ID)) {
    void backfillRecent(chronik, store, TOKEN_ID).catch(console.warn);
    setInterval(() => {
      void ingestUnconfirmed(chronik, store, TOKEN_ID).catch(console.warn);
    }, POLL_MS);
  }
});
