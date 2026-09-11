/**
 * IndexedDB storage for the encrypted seed vault.
 * Only ciphertext + the derived address live here; the mnemonic stays encrypted.
 */
import type { EncryptedSeedBlob } from '../../../../src/wallet/seedCrypto.js';

const DB_NAME = 'onest-wallet';
const DB_VERSION = 1;
const STORE = 'vault';
const VAULT_KEY = 'seed';

export interface StoredVault {
  blob: EncryptedSeedBlob;
  address: string;
  createdAt: number;
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

export async function saveVault(vault: StoredVault): Promise<void> {
  await withStore('readwrite', store => store.put(vault, VAULT_KEY) as IDBRequest<IDBValidKey>);
}

export async function loadVault(): Promise<StoredVault | null> {
  const value = await withStore<StoredVault | undefined>('readonly', store =>
    store.get(VAULT_KEY) as IDBRequest<StoredVault | undefined>,
  );
  return value ?? null;
}

export async function clearVault(): Promise<void> {
  await withStore('readwrite', store => store.delete(VAULT_KEY) as IDBRequest<undefined>);
}
