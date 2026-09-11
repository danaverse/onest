import {
  decryptSeed,
  encryptSeed,
  isValidPin,
  PBKDF2_ITERATIONS,
  PIN_FIELD_SEP,
} from '../src/wallet/seedCrypto.js';
import { userBindMessage, USER_BIND_VERSION } from '../src/wallet/bindMessage.js';

const FAST = { iterations: 10_000 };

describe('pin seed vault', () => {
  it('roundtrips a mnemonic with a 4-digit PIN', async () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const blob = await encryptSeed(mnemonic, '0427', FAST);
    expect(blob.version).toBe(1);
    expect(blob.kdf).toBe('PBKDF2-SHA256');
    expect(blob.ciphertext).not.toContain('abandon');
    await expect(decryptSeed(blob, '0427')).resolves.toBe(mnemonic);
  });

  it('supports a device pepper that must match on decrypt', async () => {
    const blob = await encryptSeed('one two three four', '123456', {
      ...FAST,
      pepper: 'device-secret-a',
    });
    await expect(
      decryptSeed(blob, '123456', { pepper: 'device-secret-a' }),
    ).resolves.toBe('one two three four');
    await expect(
      decryptSeed(blob, '123456', { pepper: 'device-secret-b' }),
    ).rejects.toThrow(/wrong pin/i);
    await expect(decryptSeed(blob, '123456')).rejects.toThrow(/wrong pin/i);
    // The PIN alone is never stored in the blob.
    expect(blob.ciphertext).not.toContain('123456');
    expect(JSON.stringify(blob)).not.toContain(PIN_FIELD_SEP);
  });

  it('rejects a wrong PIN without leaking the seed', async () => {
    const blob = await encryptSeed('one two three four', '1111', FAST);
    await expect(decryptSeed(blob, '9999')).rejects.toThrow(/wrong pin/i);
  });

  it('uses unique salts and ivs per encryption', async () => {
    const a = await encryptSeed('same seed', '4242', FAST);
    const b = await encryptSeed('same seed', '4242', FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('enforces the PIN format and default KDF strength', async () => {
    await expect(encryptSeed('seed', '123', FAST)).rejects.toThrow(/at least 4/);
    await expect(encryptSeed('seed', '', FAST)).rejects.toThrow(/pin required/i);
    expect(isValidPin('0427')).toBe(true);
    expect(isValidPin('123456789012')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('1234567890123')).toBe(false);
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });
});

describe('user bind message', () => {
  it('is versioned and install-scoped', () => {
    expect(userBindMessage('install-12345678')).toBe(
      `${USER_BIND_VERSION}:install-12345678`,
    );
    expect(() => userBindMessage('')).toThrow();
  });
});
