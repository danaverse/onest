import { toHex } from 'ecash-lib';
import { Wallet } from 'ecash-wallet';
import type { ChronikClient } from 'chronik-client';
import type { MintWallet } from './loadMintWallet.js';
import { tipFeeAccountNumber } from './fuelUtxo.js';

function normalizeMnemonic(raw: string): string {
  return raw.trim().split(/\s+/).join(' ');
}

export { tipFeeAccountNumber };

export async function loadTipFeeWallet(
  chronik: ChronikClient,
  tipIndex: number,
): Promise<MintWallet> {
  const mnemonic = process.env.MINT_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new Error(
      'MINT_MNEMONIC required for tip fee wallets (HD accounts from the desk phrase)',
    );
  }
  const phrase = normalizeMnemonic(mnemonic);
  const words = phrase.split(' ');
  if (words.length !== 12 && words.length !== 24) {
    throw new Error(
      `MINT_MNEMONIC must be 12 or 24 words (got ${words.length})`,
    );
  }

  const accountNumber = tipFeeAccountNumber(tipIndex);
  const wallet = Wallet.fromMnemonic(phrase, chronik, {
    hd: true,
    accountNumber,
    receiveIndex: 0,
    changeIndex: 0,
  });
  await wallet.sync();
  return {
    wallet,
    sk: wallet.sk,
    pk: wallet.pk,
    address: wallet.address,
    source: 'mnemonic',
  };
}

export function tipFeeWalletSummary(m: MintWallet, tipIndex: number) {
  return {
    tipIndex,
    accountNumber: tipFeeAccountNumber(tipIndex),
    address: m.address,
    pkHex: toHex(m.pk),
  };
}
