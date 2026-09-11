/**
 * IndexedDB storage for the PIN-encrypted seed vault.
 * Ciphertext + the derived address live here; the mnemonic stays encrypted.
 * A random device pepper (kept under a separate key) is mixed into the KDF,
 * so a copied vault record alone cannot be brute-forced against a short PIN.
 */
import type { EncryptedSeedBlob } from '../../../../src/wallet/seedCrypto.js';

const DB_NAME = 'onest-wallet';
const DB_VERSION = 1;
const STORE = 'vault';
const VAULT_KEY = 'seed';
const PEPPER_KEY = 'device-pepper';

export interface StoredVault {
  blob: EncryptedSeedBlob;
  address: string;
  createdAt: number;
  /** True when the blob was encrypted with the device pepper. */
  peppered?: boolean;
}

export function walletStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    tx.oncomplete = () => db.close();
  });
}

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let out = '';
  for (const b of buf) out += b.toString(16).padStart(2, '0');
  return out;
}

async function getDevicePepper(): Promise<string | null> {
  const value = await withStore<string | undefined>('readonly', store =>
    store.get(PEPPER_KEY) as IDBRequest<string | undefined>,
  );
  return value ?? null;
}

export async function ensureDevicePepper(): Promise<string> {
  const existing = await getDevicePepper();
  if (existing) return existing;
  const created = randomHex(32);
  await withStore('readwrite', store => store.put(created, PEPPER_KEY) as IDBRequest<IDBValidKey>);
  return created;
}

export async function saveVault(vault: Omit<StoredVault, 'peppered'>): Promise<void> {
  await withStore('readwrite', store =>
    store.put({ ...vault, peppered: true }, VAULT_KEY) as IDBRequest<IDBValidKey>,
  );
}

export async function loadVault(): Promise<StoredVault | null> {
  const value = await withStore<StoredVault | undefined>('readonly', store =>
    store.get(VAULT_KEY) as IDBRequest<StoredVault | undefined>,
  );
  return value ?? null;
}

export async function vaultPepper(vault: StoredVault): Promise<string | undefined> {
  if (!vault.peppered) return undefined;
  const pepper = await getDevicePepper();
  if (!pepper) {
    throw new Error('Device key missing — restore your wallet from the seed phrase');
  }
  return pepper;
}

export async function clearVault(): Promise<void> {
  await withStore('readwrite', store => store.delete(VAULT_KEY) as IDBRequest<undefined>);
}
