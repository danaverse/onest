/**
 * Passphrase-encrypted seed vault primitives.
 *
 * AES-GCM with a PBKDF2-SHA256 derived key. Pure WebCrypto so the same code
 * runs in the browser (IndexedDB stores the blob) and in Node tests.
 * The passphrase and mnemonic never leave this module.
 */

export const SEED_VAULT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;

export interface EncryptedSeedBlob {
  version: typeof SEED_VAULT_VERSION;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** base64 */
  salt: string;
  /** base64 */
  iv: string;
  /** base64 AES-GCM ciphertext of the UTF-8 mnemonic */
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(raw: string): Uint8Array {
  const binary = atob(raw);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSeed(
  mnemonic: string,
  passphrase: string,
  opts?: { iterations?: number },
): Promise<EncryptedSeedBlob> {
  const clean = mnemonic.trim();
  if (!clean) throw new Error('mnemonic required');
  if (!passphrase || passphrase.length < 8) {
    throw new Error('passphrase must be at least 8 characters');
  }
  const iterations = Math.max(1, opts?.iterations ?? PBKDF2_ITERATIONS);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(clean) as unknown as BufferSource,
  );
  return {
    version: SEED_VAULT_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** Throws when the passphrase is wrong or the blob is corrupt. */
export async function decryptSeed(
  blob: EncryptedSeedBlob,
  passphrase: string,
): Promise<string> {
  if (blob.version !== SEED_VAULT_VERSION) {
    throw new Error(`Unsupported seed vault version: ${blob.version}`);
  }
  const salt = base64ToBytes(blob.salt);
  const iv = base64ToBytes(blob.iv);
  const key = await deriveKey(passphrase, salt, blob.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      base64ToBytes(blob.ciphertext) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Wrong passphrase');
  }
}
