/**
 * PIN-encrypted seed vault primitives.
 *
 * AES-GCM with a PBKDF2-SHA256 derived key. Pure WebCrypto so the same code
 * runs in the browser (IndexedDB stores the blob) and in Node tests.
 *
 * The KDF input is `pin \x1f pepper` when a device pepper is supplied: the
 * pepper lives in the local vault store, so a copied vault blob alone cannot
 * be brute-forced against the (short) PIN offline. The PIN and mnemonic never
 * leave this module.
 */

export const SEED_VAULT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 12;
export const PIN_FIELD_SEP = '\u001f';

export function isValidPin(pin: string): boolean {
  const p = String(pin || '').trim();
  return (
    p.length >= MIN_PIN_LENGTH &&
    p.length <= MAX_PIN_LENGTH &&
    /^\d+$/.test(p)
  );
}

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

function kdfSecret(pin: string, pepper?: string): string {
  const cleanPin = String(pin || '').trim();
  if (!cleanPin) throw new Error('PIN required');
  if (cleanPin.length < MIN_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} digits`);
  }
  const cleanPepper = pepper?.trim();
  return cleanPepper ? `${cleanPin}${PIN_FIELD_SEP}${cleanPepper}` : cleanPin;
}

export async function encryptSeed(
  mnemonic: string,
  pin: string,
  opts?: { iterations?: number; pepper?: string },
): Promise<EncryptedSeedBlob> {
  const clean = mnemonic.trim();
  if (!clean) throw new Error('mnemonic required');
  const secret = kdfSecret(pin, opts?.pepper);
  const iterations = Math.max(1, opts?.iterations ?? PBKDF2_ITERATIONS);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(secret, salt, iterations);
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

/** Throws when the PIN is wrong or the blob is corrupt. */
export async function decryptSeed(
  blob: EncryptedSeedBlob,
  pin: string,
  opts?: { pepper?: string },
): Promise<string> {
  if (blob.version !== SEED_VAULT_VERSION) {
    throw new Error(`Unsupported seed vault version: ${blob.version}`);
  }
  const secret = kdfSecret(pin, opts?.pepper);
  const salt = base64ToBytes(blob.salt);
  const iv = base64ToBytes(blob.iv);
  const key = await deriveKey(secret, salt, blob.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      base64ToBytes(blob.ciphertext) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Wrong PIN');
  }
}
