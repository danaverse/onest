import { fromHex, toHex } from 'ecash-lib';
import { Wallet } from 'ecash-wallet';
import type { ChronikClient } from 'chronik-client';

export interface MintWallet {
  wallet: Wallet;
  sk: Uint8Array;
  pk: Uint8Array;
  address: string;
  source: 'mnemonic' | 'mint_sk' | 'genesis_sk';
}

function normalizeMnemonic(raw: string): string {
  return raw.trim().split(/\s+/).join(' ');
}

export async function loadMintWallet(
  chronik: ChronikClient,
): Promise<MintWallet> {
  const mnemonic = process.env.MINT_MNEMONIC?.trim();
  if (mnemonic) {
    const phrase = normalizeMnemonic(mnemonic);
    const words = phrase.split(' ');
    if (words.length !== 12 && words.length !== 24) {
      throw new Error(
        `MINT_MNEMONIC must be 12 or 24 words (got ${words.length})`,
      );
    }
    const wallet = Wallet.fromMnemonic(phrase, chronik);
    await wallet.sync();
    return {
      wallet,
      sk: wallet.sk,
      pk: wallet.pk,
      address: wallet.address,
      source: 'mnemonic',
    };
  }

  const skHex =
    process.env.MINT_SK_HEX?.trim() || process.env.GENESIS_SK_HEX?.trim();
  if (!skHex || !/^[0-9a-fA-F]{64}$/.test(skHex)) {
    throw new Error(
      'Set MINT_MNEMONIC (preferred) or MINT_SK_HEX / GENESIS_SK_HEX',
    );
  }

  const wallet = Wallet.fromSk(fromHex(skHex), chronik);
  await wallet.sync();
  return {
    wallet,
    sk: wallet.sk,
    pk: wallet.pk,
    address: wallet.address,
    source: process.env.MINT_SK_HEX ? 'mint_sk' : 'genesis_sk',
  };
}

export function mintWalletSummary(m: MintWallet) {
  return {
    address: m.address,
    source: m.source,
    pkHex: toHex(m.pk),
  };
}
