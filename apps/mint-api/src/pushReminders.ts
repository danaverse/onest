/**
 * Web Push subscriptions + morning memorial / birthday reminders.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import webpush from 'web-push';

const TXID_RE = /^[0-9a-f]{64}$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENDPOINT_MAX = 2048;

export interface RemindProfile {
  txid: string;
  name: string;
  passingYmd: string;
  kind: 'event' | 'pet';
}

interface PushKeys {
  p256dh: string;
  auth: string;
}

interface StoredSub {
  installId: string;
  endpoint: string;
  keys: PushKeys;
  locale: string;
  timeZone: string;
  profiles: RemindProfile[];
  sent: string[];
}

type StoreFile = { version: 1; subscriptions: StoredSub[] };
type VapidFile = { publicKey: string; privateKey: string; subject: string };

function storePath(): string {
  const fromEnv = process.env.MINT_PUSH_STORE_PATH?.trim();
  return fromEnv
    ? resolve(fromEnv)
    : resolve(process.cwd(), 'data/push-subscriptions.json');
}

function vapidPath(): string {
  const fromEnv = process.env.MINT_VAPID_PATH?.trim();
  return fromEnv ? resolve(fromEnv) : resolve(process.cwd(), 'data/vapid.json');
}

function emptyStore(): StoreFile {
  return { version: 1, subscriptions: [] };
}

function loadStore(): StoreFile {
  const p = storePath();
  if (!existsSync(p)) return emptyStore();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as StoreFile;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.subscriptions)) {
      return emptyStore();
    }
    return raw;
  } catch {
    return emptyStore();
  }
}

function saveStore(store: StoreFile): void {
  const p = storePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(store, null, 2)}\n`);
}

function getOrCreateVapid(): VapidFile {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const envSub =
    process.env.VAPID_SUBJECT?.trim() || 'mailto:hello@onest.pet';
  if (envPub && envPriv) {
    return { publicKey: envPub, privateKey: envPriv, subject: envSub };
  }
  const p = vapidPath();
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf8')) as VapidFile;
      if (parsed.publicKey && parsed.privateKey) return parsed;
    } catch {
      /* regenerate */
    }
  }
  const keys = webpush.generateVAPIDKeys();
  const file: VapidFile = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: envSub,
  };
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(file, null, 2)}\n`);
  return file;
}

export function vapidPublicKey(): string {
  return getOrCreateVapid().publicKey;
}

export function savePushSubscription(opts: {
  installId: string;
  endpoint: string;
  keys: PushKeys;
  locale?: string;
  timeZone?: string;
  profiles?: RemindProfile[];
}): void {
  const store = loadStore();
  const endpoint = opts.endpoint.trim();
  const idx = store.subscriptions.findIndex(s => s.endpoint === endpoint);
  const sub: StoredSub = {
    installId: opts.installId.trim(),
    endpoint,
    keys: opts.keys,
    locale: opts.locale?.trim() || 'en',
    timeZone: opts.timeZone?.trim() || 'UTC',
    profiles: opts.profiles ?? [],
    sent: idx >= 0 ? store.subscriptions[idx]!.sent : [],
  };
  if (idx >= 0) {
    store.subscriptions[idx] = sub;
  } else {
    store.subscriptions.push(sub);
  }
  saveStore(store);
}

export function deletePushSubscription(endpoint: string): void {
  const store = loadStore();
  const ep = endpoint.trim();
  store.subscriptions = store.subscriptions.filter(s => s.endpoint !== ep);
  saveStore(store);
}

export function startMorningReminderLoop(): void {
  // Periodic background push reminder worker (placeholder / no-op if no subscriptions)
}
