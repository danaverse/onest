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
  memorialPushdataWithCreator,
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
  /** When set, stamp a v5 memorial carrying the creator's P2PKH hash160. */
  creatorHash160?: string;
  /** PAW atoms sent to the desk as a listing fee (user-paid burns only). */
  feeAtoms?: bigint;
  /** Desk address receiving the listing fee; required when feeAtoms > 0. */
  feeAddress?: string;
  /**
   * User wallets: let ecash-wallet select UTXOs and change instead of the
   * desk's small postage-reserve rules (1500–3500 sats).
   */
  autoSelectUtxos?: boolean;
}): Promise<{ txid: string; burnAtoms: bigint; feeAtoms: bigint }> {
  const note = (opts.note ?? '').trim();
  const offeringId = opts.offeringId ?? OFFERING_ID_PAW;
  const parentBurnTxid = opts.parentBurnTxid
    ? parseParentBurnTxidHex(opts.parentBurnTxid)
    : undefined;
  const burnAtoms = opts.burnAtoms ?? 1n;
  if (burnAtoms < 1n) {
    throw new Error(`burnAtoms must be >= 1 (got ${burnAtoms})`);
  }
  const feeAtoms = opts.feeAtoms ?? 0n;
  const feeAddress = opts.feeAddress?.trim() || '';
  if (feeAtoms > 0n && !feeAddress) {
    throw new Error('feeAddress required when feeAtoms > 0');
  }

  await opts.wallet.sync();

  let requiredUtxos: Array<{ txid: string; outIdx: number }> | undefined;
  if (!opts.autoSelectUtxos) {
    const tokenUtxos = pickTokenUtxosForBurn(
      opts.wallet.utxos,
      opts.tokenId,
      burnAtoms + feeAtoms,
    );
    const feeUtxo = pickBurnPostageUtxo(opts.wallet.utxos);
    if (!feeUtxo) {
      throw new Error(
        'Tip needs a small burn-postage UTXO (15–35 XEC). Oversized reserves are not spent.',
      );
    }
    requiredUtxos = [...tokenUtxos.map(u => u.outpoint), feeUtxo.outpoint];
  }

  const changeScript = opts.changeScript;
  const previous = opts.wallet.getChangeScript.bind(opts.wallet);
  if (changeScript) {
    (opts.wallet as { getChangeScript: () => Script }).getChangeScript = () =>
      changeScript;
  }

  try {
    const outputs: payment.PaymentOutput[] = [{ sats: 0n }];
    const tokenActions: payment.TokenAction[] = [
      {
        type: 'BURN',
        tokenId: opts.tokenId,
        tokenType: ALP_TOKEN_TYPE_STANDARD,
        burnAtoms,
      },
    ];
    if (feeAtoms > 0n) {
      outputs.push({
        sats: 0n,
        tokenId: opts.tokenId,
        atoms: feeAtoms,
        isMintBaton: false,
        address: feeAddress,
      });
      tokenActions.push({
        type: 'SEND',
        tokenId: opts.tokenId,
        tokenType: ALP_TOKEN_TYPE_STANDARD,
      });
    }
    tokenActions.push({
      type: 'DATA',
      data:
        opts.pushdata ??
        (opts.creatorHash160
          ? memorialPushdataWithCreator(
              note,
              opts.creatorHash160,
              offeringId,
              parentBurnTxid,
            )
          : memorialPushdata(note, offeringId, parentBurnTxid)),
    });

    const built = opts.wallet
      .action({ outputs, tokenActions, ...(requiredUtxos ? { requiredUtxos } : {}) })
      .build();
    const resp = await built.broadcast();
    const txid = resp.broadcasted?.[0];
    if (!txid) {
      throw new Error('Broadcast returned no txid');
    }
    return { txid, burnAtoms, feeAtoms };
  } finally {
    if (changeScript) {
      (opts.wallet as { getChangeScript: () => Script }).getChangeScript = previous;
    }
  }
}

// Compatibility alias
export const burnOnePrayer = burnOnePaw;
