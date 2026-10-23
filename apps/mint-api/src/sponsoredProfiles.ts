/**
 * First-profile sponsorship ledger: one desk-sponsored pet profile per
 * install. Persisted so a mint-api restart does not hand out a second one.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Entry = { at: string };
type StoreFile = { version: 1; installs: Record<string, Entry> };

function storePath(): string {
  const fromEnv = process.env.MINT_SPONSORED_PROFILES_PATH?.trim();
  return fromEnv
    ? resolve(fromEnv)
    : resolve(process.cwd(), 'data/sponsored-profiles.json');
}

function emptyStore(): StoreFile {
  return { version: 1, installs: {} };
}

function loadStore(): StoreFile {
  const path = storePath();
  if (!existsSync(path)) return emptyStore();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as StoreFile;
    if (!raw || raw.version !== 1 || typeof raw.installs !== 'object') {
      return emptyStore();
    }
    return { version: 1, installs: raw.installs ?? {} };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: StoreFile): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

function normInstallId(raw: string): string {
  return String(raw || '').trim();
}

export function hasSponsoredProfile(installId: string): boolean {
  const id = normInstallId(installId);
  if (!id) return false;
  return Boolean(loadStore().installs[id]);
}

export function rememberSponsoredProfile(installId: string): void {
  const id = normInstallId(installId);
  if (!id) return;
  const store = loadStore();
  if (store.installs[id]) return;
  store.installs[id] = { at: new Date().toISOString() };
  saveStore(store);
}
