import {
  ALP_TOKEN_TYPE_STANDARD,
  DEFAULT_DUST_SATS,
  payment,
  type Script,
} from 'ecash-lib';
import type { Wallet } from 'ecash-wallet';
import { pickBurnPostageUtxo } from '../mint/fuelUtxo.js';
import {
  memorialPushdata,
  OFFERING_ID_PAW,
  parseParentBurnTxidHex,
} from './danaMemorial.js';

export {
  memorialPushdata,
  parseMemorialPushdata,
  parseParentBurnTxidHex,
  DANA_LOKAD,
  DANA_VERSION,
  DANA_VERSION_PARENT,
  DANA_PARENT_TXID_LEN,
  OFFERING_ID_PAW,
  type MemorialFields,
} from './danaMemorial.js';

export { explorerTx, danaExplorerOrigin, DEFAULT_DANA_EXPLORER_ORIGIN } from '../explorer.js';

export type TokenUtxoLike = {
  outpoint: { txid: string; outIdx: number };
  token?: {
    tokenId?: string;
    atoms?: bigint | number | string;
    isMintBaton?: boolean;
  };
};

export function pickTokenUtxosForBurn<T extends TokenUtxoLike>(
  utxos: T[],
  tokenId: string,
  needAtoms: bigint,
): T[] {
  const lots = utxos
    .filter(
      (u): u is T & { token: { tokenId: string; atoms: bigint | number | string; isMintBaton?: boolean } } =>
        u.token?.tokenId === tokenId &&
        u.token.atoms != null &&
        !u.token.isMintBaton,
    )
    .map(u => ({ u, atoms: BigInt(u.token.atoms) }))
    .sort((a, b) => (a.atoms < b.atoms ? -1 : a.atoms > b.atoms ? 1 : 0));
  const single = lots.find(x => x.atoms >= needAtoms);
  if (single) return [single.u];
  const picked: T[] = [];
  let sum = 0n;
  for (const x of lots) {
    picked.push(x.u);
    sum += x.atoms;
    if (sum >= needAtoms) return picked;
  }
  throw new Error(
    `Need >= ${needAtoms} atoms of ${tokenId.slice(0, 8)}... (have ${sum})`,
  );
}

export async function burnOnePaw(opts: {
  wallet: Wallet;
  tokenId: string;
  note?: string;
  offeringId?: string;
  parentBurnTxid?: string;
  burnAtoms?: bigint;
  changeScript?: Script;
  /** Raw DANA pushdata override (v3 vote / v4 post stamp). */
  pushdata?: Uint8Array;
}): Promise<{ txid: string; burnAtoms: bigint }> {
  const note = (opts.note ?? '').trim();
  const offeringId = opts.offeringId ?? OFFERING_ID_PAW;
  const parentBurnTxid = opts.parentBurnTxid
    ? parseParentBurnTxidHex(opts.parentBurnTxid)
    : undefined;
  const burnAtoms = opts.burnAtoms ?? 1n;
  if (burnAtoms < 1n) {
    throw new Error(`burnAtoms must be >= 1 (got ${burnAtoms})`);
  }

  await opts.wallet.sync();
  const tokenUtxos = pickTokenUtxosForBurn(
    opts.wallet.utxos,
    opts.tokenId,
    burnAtoms,
  );

  const feeUtxo = pickBurnPostageUtxo(opts.wallet.utxos);
  if (!feeUtxo) {
    throw new Error(
      'Tip needs a small burn-postage UTXO (15–35 XEC). Oversized reserves are not spent.',
    );
  }
  const requiredUtxos = [
    ...tokenUtxos.map(u => u.outpoint),
    feeUtxo.outpoint,
  ];

  const changeScript = opts.changeScript ?? opts.wallet.script;
  const previous = opts.wallet.getChangeScript.bind(opts.wallet);
  (opts.wallet as { getChangeScript: () => Script }).getChangeScript = () =>
    changeScript;

  try {
    const outputs: payment.PaymentOutput[] = [{ sats: 0n }];
    const tokenActions: payment.TokenAction[] = [
      {
        type: 'BURN',
        tokenId: opts.tokenId,
        tokenType: ALP_TOKEN_TYPE_STANDARD,
        burnAtoms,
      },
      {
        type: 'DATA',
        data: opts.pushdata ?? memorialPushdata(note, offeringId, parentBurnTxid),
      },
    ];

    const built = opts.wallet.action({ outputs, tokenActions, requiredUtxos }).build();
    const resp = await built.broadcast();
    const txid = resp.broadcasted?.[0];
    if (!txid) {
      throw new Error('Broadcast returned no txid');
    }
    return { txid, burnAtoms };
  } finally {
    (opts.wallet as { getChangeScript: () => Script }).getChangeScript = previous;
  }
}

// Compatibility alias
export const burnOnePrayer = burnOnePaw;
