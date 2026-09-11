#!/usr/bin/env tsx
/**
 * Onest PAW Mint API server.
 *
 *   POST /api/challenge  { installId, note?, parentBurnTxid? }
 *   POST /api/submit     { installId, challengeId, nonceHex, powMs?, powAttempts? }
 *   POST /api/burn       { installId, remintTxid, burnToken }
 *   POST /api/cancel     { installId, challengeId?, remintTxid?, burnToken? }
 *   GET  /api/status?installId=
 *   GET  /api/root-creator?txid=&installId=
 *   POST /api/push/subscribe
 *   POST /api/push/unsubscribe
 *   GET  /api/push/vapid
 *   GET  /health
 */
import './loadMintEnv.boot.js';
import { createServer } from 'node:http';
import {
  enqueueBurn,
  enqueueCancel,
  enqueueChallenge,
  enqueueSubmit,
  listingFeeInfo,
  notifyDanaIndex,
  publicStatus,
  remainingOffersToday,
  requireMintDesk,
  WaitNotElapsedError,
} from './offer.js';
import { checkRootCreator } from './rootCreators.js';
import { createPaidProfile, profileFeeInfo } from './paidProfile.js';
import {
  deletePushSubscription,
  savePushSubscription,
  startMorningReminderLoop,
  vapidPublicKey,
} from './pushReminders.js';
import {
  PayloadTooLargeError,
  readJsonBody,
} from '../../../src/lib/httpJson.js';

const PORT = Number(process.env.MINT_API_PORT?.trim() || 8787);
const STARTED_AT = new Date().toISOString();

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

function requireInstallId(raw: unknown): string {
  const installId = String(raw || '').trim();
  if (!installId || installId.length < 8 || installId.length > 128) {
    throw new Error('installId required (8–128 chars)');
  }
  return installId;
}

function clientIp(req: import('node:http').IncomingMessage): string | undefined {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded;
  if (Array.isArray(forwarded) && forwarded.length) return forwarded[0];
  return req.socket.remoteAddress ?? undefined;
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
        service: 'onest-mint-api',
        startedAt: STARTED_AT,
        features: publicStatus(),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const installId = url.searchParams.get('installId')?.trim();
      json(res, 200, publicStatus(installId));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/root-creator') {
      const txid = (url.searchParams.get('txid') || '').trim();
      const installId = (url.searchParams.get('installId') || '').trim();
      if (!txid || !installId) {
        json(res, 400, { error: 'txid and installId required' });
        return;
      }
      const status = checkRootCreator({ rootBurnTxid: txid, installId });
      json(res, 200, status);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/profile/fee') {
      json(res, 200, await profileFeeInfo());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profile/create') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const result = await createPaidProfile({
        installId,
        address: String(body.address || ''),
        paymentTxid: String(body.paymentTxid || ''),
        note: typeof body.note === 'string' ? body.note : '',
        parentBurnTxid:
          typeof body.parentBurnTxid === 'string' ? body.parentBurnTxid : undefined,
      });
      json(res, 200, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/listing-fee') {
      const info = await listingFeeInfo();
      json(res, 200, { ok: true, ...info });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/notify') {
      const body = await readJsonBody(req);
      const burnTxid = String(body.burnTxid || '').trim().toLowerCase();
      if (!/^[0-9a-fA-F]{64}$/.test(burnTxid)) {
        json(res, 400, { error: 'valid burnTxid required' });
        return;
      }
      notifyDanaIndex(
        burnTxid,
        typeof body.installId === 'string' ? body.installId : undefined,
      );
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/push/vapid') {
      json(res, 200, { ok: true, publicKey: vapidPublicKey() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/push/subscribe') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const endpoint = String(body.endpoint || '').trim();
      const keys = body.keys as { p256dh: string; auth: string };
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        json(res, 400, { error: 'endpoint and keys required' });
        return;
      }
      savePushSubscription({
        installId,
        endpoint,
        keys,
        locale: typeof body.locale === 'string' ? body.locale : undefined,
        timeZone: typeof body.timeZone === 'string' ? body.timeZone : undefined,
        profiles: Array.isArray(body.profiles) ? (body.profiles as any) : undefined,
      });
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/push/unsubscribe') {
      const body = await readJsonBody(req);
      const endpoint = String(body.endpoint || '').trim();
      if (!endpoint) {
        json(res, 400, { error: 'endpoint required' });
        return;
      }
      deletePushSubscription(endpoint);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/challenge') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const note = typeof body.note === 'string' ? body.note : undefined;
      const parentBurnTxid = typeof body.parentBurnTxid === 'string' ? body.parentBurnTxid : undefined;
      const challenge = await enqueueChallenge({
        installId,
        clientIp: clientIp(req),
        kind: typeof body.kind === 'string' ? body.kind : undefined,
        note,
        parentBurnTxid,
        contentHash: typeof body.contentHash === 'string' ? body.contentHash : undefined,
        postHash: typeof body.postHash === 'string' ? body.postHash : undefined,
        direction: body.direction,
        targetType: body.targetType,
      });
      json(res, 200, challenge);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/submit') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const challengeId = String(body.challengeId || '').trim();
      const nonceHex = String(body.nonceHex || '').trim();
      if (!challengeId || !nonceHex) {
        json(res, 400, { error: 'challengeId and nonceHex required' });
        return;
      }
      const result = await enqueueSubmit({
        installId,
        challengeId,
        nonceHex,
        powMs: typeof body.powMs === 'number' ? body.powMs : undefined,
        powAttempts: typeof body.powAttempts === 'number' ? body.powAttempts : undefined,
      });
      json(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/burn') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const remintTxid = String(body.remintTxid || '').trim();
      const burnToken = String(body.burnToken || '').trim();
      if (!remintTxid || !burnToken) {
        json(res, 400, { error: 'remintTxid and burnToken required' });
        return;
      }
      const result = await enqueueBurn({ installId, remintTxid, burnToken });
      json(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/cancel') {
      const body = await readJsonBody(req);
      const installId = requireInstallId(body.installId);
      const challengeId = typeof body.challengeId === 'string' ? body.challengeId : undefined;
      const remintTxid = typeof body.remintTxid === 'string' ? body.remintTxid : undefined;
      const burnToken = typeof body.burnToken === 'string' ? body.burnToken : undefined;
      const result = await enqueueCancel({ installId, challengeId, remintTxid, burnToken });
      json(res, 200, result);
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof WaitNotElapsedError) {
      json(res, 425, { error: msg, retryAfterMs: e.retryAfterMs });
      return;
    }
    const status = e instanceof PayloadTooLargeError ? 413 : 400;
    json(res, status, { error: msg });
  }
});

try {
  requireMintDesk();
} catch (err) {
  console.warn('Notice starting mint desk:', err);
}

server.listen(PORT, () => {
  console.log(`Onest mint-api listening on :${PORT} startedAt=${STARTED_AT}`);
  startMorningReminderLoop();
});
