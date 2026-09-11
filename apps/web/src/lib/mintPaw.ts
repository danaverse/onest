/**
 * User-paid remint from the browser wallet: split a XEC fuel UTXO, ask the
 * desk for a reserved baton + preimages, mine PoW on-device, sign locally and
 * let the desk assemble/broadcast. Minted PAW lands in this wallet.
 */
import { toHex } from 'ecash-lib';
import type { Wallet } from 'ecash-wallet';
import { signBip143Preimage } from '../../../../src/mint/clientMintSign.js';
import { MINT_API_BASE, getOrCreateInstallId } from './config.js';
import { mineInWorker } from './mineRunner.js';

const TARGET_FUEL_SATS = 7_000n;
const MIN_FUEL_SATS = 4_500n;
const MAX_FUEL_SATS = 9_000n;
const SPLIT_HEADROOM_SATS = 3_000n;

export interface MintProgress {
  (message: string): void;
}

interface WalletUtxoLike {
  outpoint: { txid: string; outIdx: number };
  sats: bigint;
  token?: unknown;
}

/** Pick or create a small pure-XEC UTXO to pay the remint's fixed outputs. */
async function ensureFuel(
  wallet: Wallet,
  onProgress?: MintProgress,
): Promise<{ txid: string; outIdx: number }> {
  await wallet.sync();
  const pure = (wallet.utxos as unknown as WalletUtxoLike[]).filter(u => !u.token);
  const inRange = pure
    .filter(u => u.sats >= MIN_FUEL_SATS && u.sats <= MAX_FUEL_SATS)
    .sort((a, b) => Number(a.sats - b.sats));
  if (inRange.length > 0) {
    return { txid: inRange[0]!.outpoint.txid, outIdx: inRange[0]!.outpoint.outIdx };
  }

  const source = [...pure]
    .sort((a, b) => Number(b.sats - a.sats))
    .find(u => u.sats >= TARGET_FUEL_SATS + SPLIT_HEADROOM_SATS);
  if (!source) {
    throw new Error('MINT_NEED_XEC');
  }

  onProgress?.('Preparing fuel (splitting XEC)...');
  const built = wallet
    .action({ outputs: [{ sats: TARGET_FUEL_SATS, script: wallet.script }] })
    .build();
  const resp = await built.broadcast();
  const splitTxid = resp.broadcasted?.[0];
  if (!splitTxid) throw new Error('Fuel split broadcast failed');
  await wallet.sync();
  const created = (wallet.utxos as unknown as WalletUtxoLike[]).find(
    u => u.outpoint.txid === splitTxid && u.sats === TARGET_FUEL_SATS,
  );
  if (!created) throw new Error('Fuel UTXO not found after split');
  return { txid: created.outpoint.txid, outIdx: created.outpoint.outIdx };
}

export async function mintPawFromWallet(opts: {
  wallet: Wallet;
  onProgress?: MintProgress;
}): Promise<{ txid: string; mintAtoms: string }> {
  const installId = getOrCreateInstallId();
  const { wallet } = opts;

  const fuel = await ensureFuel(wallet, opts.onProgress);

  opts.onProgress?.('Reserving a mint baton...');
  const challengeRes = await fetch(`${MINT_API_BASE}/api/mint/client/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      address: wallet.address,
      pkHex: toHex(wallet.pk),
      fuelTxid: fuel.txid,
      fuelOutIdx: fuel.outIdx,
    }),
  });
  if (!challengeRes.ok) {
    const err = await challengeRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || `Mint challenge HTTP ${challengeRes.status}`,
    );
  }
  const challenge = await challengeRes.json();

  opts.onProgress?.(`Mining PAW PoW (${challenge.bits} bits)...`);
  const mined = await mineInWorker({
    powPrefixHex: challenge.powPrefixHex,
    bits: challenge.bits,
    nonceLength: challenge.nonceLength,
    onProgress: p => {
      opts.onProgress?.(
        `Mining PAW: ${p.attempts.toLocaleString()} attempts (${p.hashrateHps.toLocaleString()} H/s)`,
      );
    },
  });

  opts.onProgress?.('Signing and broadcasting the mint...');
  const batonSigHex = toHex(signBip143Preimage(challenge.preimageHex, wallet.sk));
  const fuelSigHex = toHex(
    signBip143Preimage(challenge.fuelPreimageHex, wallet.sk),
  );

  const submitRes = await fetch(`${MINT_API_BASE}/api/mint/client/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      challengeId: challenge.challengeId,
      nonceHex: mined.nonceHex,
      batonSigHex,
      fuelSigHex,
    }),
  });
  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || `Mint submit HTTP ${submitRes.status}`,
    );
  }
  const minted = await submitRes.json();
  await wallet.sync().catch(() => undefined);
  return { txid: minted.txid, mintAtoms: minted.mintAtoms };
}
