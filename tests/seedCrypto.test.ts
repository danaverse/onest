import {
  decryptSeed,
  encryptSeed,
  PBKDF2_ITERATIONS,
} from '../src/wallet/seedCrypto.js';
import { userBindMessage, USER_BIND_VERSION } from '../src/wallet/bindMessage.js';

const FAST = { iterations: 10_000 };

describe('seed crypto vault', () => {
  it('roundtrips a mnemonic with the correct passphrase', async () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const blob = await encryptSeed(mnemonic, 'correct horse battery', FAST);
    expect(blob.version).toBe(1);
    expect(blob.kdf).toBe('PBKDF2-SHA256');
    expect(blob.ciphertext).not.toContain('abandon');
    await expect(decryptSeed(blob, 'correct horse battery')).resolves.toBe(mnemonic);
  });

  it('rejects a wrong passphrase without leaking the seed', async () => {
    const blob = await encryptSeed('one two three four', 'right-passphrase', FAST);
    await expect(decryptSeed(blob, 'wrong-passphrase')).rejects.toThrow(/wrong passphrase/i);
  });

  it('uses unique salts and ivs per encryption', async () => {
    const a = await encryptSeed('same seed', 'passphrase-1', FAST);
    const b = await encryptSeed('same seed', 'passphrase-1', FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('enforces a minimum passphrase length and default KDF strength', async () => {
    await expect(encryptSeed('seed', 'short', FAST)).rejects.toThrow(/at least 8/);
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
