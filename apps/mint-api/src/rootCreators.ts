import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const TXID_RE = /^[0-9a-f]{64}$/;

type RootEntry = { installId: string; at: string };
type StoreFile = { version: 1; roots: Record<string, RootEntry> };

function storePath(): string {
  const fromEnv = process.env.MINT_ROOT_CREATORS_PATH?.trim();
  return fromEnv
    ? resolve(fromEnv)
    : resolve(process.cwd(), 'data/root-creators.json');
}

function emptyStore(): StoreFile {
  return { version: 1, roots: {} };
}

function loadStore(): StoreFile {
  const path = storePath();
  if (!existsSync(path)) return emptyStore();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as StoreFile;
    if (!raw || raw.version !== 1 || typeof raw.roots !== 'object') {
      return emptyStore();
    }
    return { version: 1, roots: raw.roots ?? {} };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: StoreFile): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

function normTxid(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  return TXID_RE.test(t) ? t : null;
}

function normInstallId(raw: string): string {
  return String(raw || '').trim();
}

export function rememberRootCreator(
  rootBurnTxid: string,
  installId: string,
): void {
  const txid = normTxid(rootBurnTxid);
  const id = normInstallId(installId);
  if (!txid || !id) return;
  const store = loadStore();
  if (store.roots[txid]) return;
  store.roots[txid] = { installId: id, at: new Date().toISOString() };
  saveStore(store);
}

export function isKnownRootCreator(
  rootBurnTxid: string,
  installId: string,
): boolean {
  const txid = normTxid(rootBurnTxid);
  const id = normInstallId(installId);
  if (!txid || !id) return false;
  const store = loadStore();
  return store.roots[txid]?.installId === id;
}

export function rootCreatorMatch(rootBurnTxid: string): string | null {
  const txid = normTxid(rootBurnTxid);
  if (!txid) return null;
  return loadStore().roots[txid]?.installId ?? null;
}

/** All remembered root creators (for startup re-attribution). */
export function listRootCreators(): Array<{ txid: string; installId: string }> {
  const store = loadStore();
  return Object.entries(store.roots).map(([txid, entry]) => ({
    txid,
    installId: entry.installId,
  }));
}

export function checkRootCreator(opts: {
  rootBurnTxid: string;
  installId: string;
}): { isCreator: boolean; known: boolean } {
  const txid = normTxid(opts.rootBurnTxid);
  const id = normInstallId(opts.installId);
  if (!txid || !id) return { isCreator: false, known: false };
  const creator = rootCreatorMatch(txid);
  if (!creator) return { isCreator: false, known: false };
  return { isCreator: creator === id, known: true };
}
