/**
 * Self-custodial user wallet: BIP39 mnemonic, encrypted at rest, bound to the
 * device install with a signed message. The seed never leaves the browser.
 */
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import type { ChronikClient } from 'chronik-client';
import type { Wallet } from 'ecash-wallet';
import {
  decryptSeed,
  encryptSeed,
  isValidPin,
} from '../../../../src/wallet/seedCrypto.js';
import { userBindMessage } from '../../../../src/wallet/bindMessage.js';
import { CHRONIK_URLS, PAW_TOKEN_ID, getOrCreateInstallId } from './config.js';
import {
  clearVault,
  ensureDevicePepper,
  loadVault,
  saveVault,
  vaultPepper,
  type StoredVault,
} from './seedVault.js';
import { bindUserProfile } from './socialApi.js';

const DEFAULT_CHRONIK = [
  'https://chronik.e.cash',
  'https://xec.paybutton.org',
];

let chronikSingleton: ChronikClient | null = null;

/** Lazy: chronik-client/ecash-wallet are heavy, load on first wallet use. */
export async function webChronik(): Promise<ChronikClient> {
  if (!chronikSingleton) {
    const { ChronikClient } = await import('chronik-client');
    chronikSingleton = new ChronikClient(
      CHRONIK_URLS.length ? CHRONIK_URLS : DEFAULT_CHRONIK,
    );
  }
  return chronikSingleton;
}

export function generateUserMnemonic(): string {
  return generateMnemonic(wordlist, 128); // 12 words
}

export function validateUserMnemonic(mnemonic: string): boolean {
  try {
    return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
  } catch {
    return false;
  }
}

export function validateUserPin(pin: string): boolean {
  return isValidPin(pin);
}

export async function walletFromMnemonic(mnemonic: string): Promise<Wallet> {
  const { Wallet } = await import('ecash-wallet');
  return Wallet.fromMnemonic(mnemonic.trim().toLowerCase(), await webChronik());
}

export async function addressFromMnemonic(mnemonic: string): Promise<string> {
  return (await walletFromMnemonic(mnemonic)).address;
}

export async function createVault(
  mnemonic: string,
  pin: string,
): Promise<StoredVault> {
  if (!validateUserMnemonic(mnemonic)) throw new Error('Invalid seed phrase');
  if (!validateUserPin(pin)) throw new Error('PIN must be 4–12 digits');
  const wallet = await walletFromMnemonic(mnemonic);
  const pepper = await ensureDevicePepper();
  const vault: StoredVault = {
    blob: await encryptSeed(mnemonic, pin, { pepper }),
    address: wallet.address,
    createdAt: Date.now(),
    peppered: true,
  };
  await saveVault(vault);
  return vault;
}

export async function readVault(): Promise<StoredVault | null> {
  return loadVault();
}

export async function unlockVault(
  pin: string,
): Promise<{ wallet: Wallet; address: string }> {
  const vault = await loadVault();
  if (!vault) throw new Error('No user profile on this device');
  const pepper = await vaultPepper(vault);
  const mnemonic = await decryptSeed(vault.blob, pin, { pepper });
  const wallet = await walletFromMnemonic(mnemonic);
  return { wallet, address: wallet.address };
}

export async function exportVaultMnemonic(pin: string): Promise<string> {
  const vault = await loadVault();
  if (!vault) throw new Error('No user profile on this device');
  const pepper = await vaultPepper(vault);
  return decryptSeed(vault.blob, pin, { pepper });
}

export async function removeVault(): Promise<void> {
  await clearVault();
}

/** Sign the device binding message and register it with dana-index. */
export async function bindWalletProfile(wallet: Wallet): Promise<void> {
  const { signMsg } = await import('ecash-lib');
  const installId = getOrCreateInstallId();
  const message = userBindMessage(installId);
  const signature = signMsg(message, wallet.sk);
  await bindUserProfile({
    installId,
    address: wallet.address,
    message,
    signature,
  });
}

export interface WalletBalances {
  xecSats: bigint;
  pawAtoms: bigint;
}

interface WalletUtxoLike {
  sats?: bigint;
  token?: { tokenId?: string; atoms?: bigint | number | string };
}

export async function fetchWalletBalances(wallet: Wallet): Promise<WalletBalances> {
  await wallet.sync();
  let xecSats = 0n;
  let pawAtoms = 0n;
  const utxos = wallet.utxos as unknown as WalletUtxoLike[];
  for (const utxo of utxos) {
    xecSats += BigInt(utxo.sats ?? 0);
    const tokenId = utxo.token?.tokenId?.toLowerCase();
    if (PAW_TOKEN_ID && tokenId === PAW_TOKEN_ID.toLowerCase() && utxo.token?.atoms != null) {
      pawAtoms += BigInt(utxo.token.atoms);
    }
  }
  return { xecSats, pawAtoms };
}
