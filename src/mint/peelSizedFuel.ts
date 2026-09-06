import { payment, type Script } from 'ecash-lib';
import type { Wallet } from 'ecash-wallet';
import {
  BURN_POSTAGE_SATS,
  OFFERING_PAIR_SATS,
  REMINT_FUEL_SATS,
  pickBurnPostageUtxo,
  pickSizedFuelUtxo,
  pickSplitSourceUtxo,
} from './fuelUtxo.js';

export type PeelSizedFuelOpts = {
  fuelScript?: Script;
  changeScript?: Script;
  sats?: bigint;
};

export type OfferingPairCoin = {
  txid: string;
  outIdx: number;
  sats: string;
};

export type OfferingPair = {
  txid: string;
  fuel: OfferingPairCoin;
  postage: OfferingPairCoin;
};

async function withChangeScript<T>(
  wallet: Wallet,
  changeScript: Script,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = wallet.getChangeScript.bind(wallet);
  (wallet as { getChangeScript: () => Script }).getChangeScript = () =>
    changeScript;
  try {
    return await fn();
  } finally {
    (wallet as { getChangeScript: () => Script }).getChangeScript = previous;
  }
}

export async function peelSizedFuel(
  wallet: Wallet,
  opts: PeelSizedFuelOpts = {},
): Promise<{ txid: string; fuelOutIdx: number; fuelSats: bigint }> {
  await wallet.sync();
  const existing = pickSizedFuelUtxo(wallet.utxos);
  if (existing) {
    return {
      txid: existing.outpoint.txid,
      fuelOutIdx: existing.outpoint.outIdx,
      fuelSats: existing.sats,
    };
  }

  const sats = opts.sats ?? REMINT_FUEL_SATS;
  const source = pickSplitSourceUtxo(wallet.utxos, sats + 2_000n);
  if (!source) {
    throw new Error('Not enough pure XEC to split remint fuel coin');
  }

  const fuelScript = opts.fuelScript ?? wallet.script;
  const changeScript = opts.changeScript ?? wallet.script;

  const outputs: payment.PaymentOutput[] = [{ sats, script: fuelScript }];
  const action = wallet.action({
    outputs,
    requiredUtxos: [source.outpoint],
  });

  const run = async () => {
    const built = action.build();
    const resp = await built.broadcast();
    const txid = resp.broadcasted?.[0];
    if (!txid) throw new Error('Peel broadcast failed');
    return { txid, fuelOutIdx: 0, fuelSats: sats };
  };

  return changeScript === wallet.script
    ? run()
    : withChangeScript(wallet, changeScript, run);
}

export async function peelOfferingPair(
  wallet: Wallet,
  opts: {
    tipScript?: Script;
    changeScript?: Script;
    fuelSats?: bigint;
    postageSats?: bigint;
  } = {},
): Promise<OfferingPair> {
  await wallet.sync();
  const fuelSats = opts.fuelSats ?? REMINT_FUEL_SATS;
  const postageSats = opts.postageSats ?? BURN_POSTAGE_SATS;
  const pairTotal = fuelSats + postageSats;

  const source = pickSplitSourceUtxo(wallet.utxos, pairTotal + 2_000n);
  if (!source) {
    throw new Error('Not enough pure XEC on wallet to split offering pair');
  }

  const tipScript = opts.tipScript ?? wallet.script;
  const changeScript = opts.changeScript ?? wallet.script;

  const outputs: payment.PaymentOutput[] = [
    { sats: fuelSats, script: tipScript },
    { sats: postageSats, script: tipScript },
  ];

  const action = wallet.action({
    outputs,
    requiredUtxos: [source.outpoint],
  });

  const run = async () => {
    const built = action.build();
    const resp = await built.broadcast();
    const txid = resp.broadcasted?.[0];
    if (!txid) throw new Error('Peel broadcast failed');
    return {
      txid,
      fuel: { txid, outIdx: 0, sats: fuelSats.toString() },
      postage: { txid, outIdx: 1, sats: postageSats.toString() },
    };
  };

  return changeScript === wallet.script
    ? run()
    : withChangeScript(wallet, changeScript, run);
}

export async function sendOfferingPairFromDesk(
  desk: Wallet,
  tip: Wallet,
  opts: { fuelSats?: bigint; postageSats?: bigint } = {},
): Promise<OfferingPair> {
  await desk.sync();
  return peelOfferingPair(desk, {
    tipScript: tip.script,
    changeScript: desk.script,
    fuelSats: opts.fuelSats,
    postageSats: opts.postageSats,
  });
}
