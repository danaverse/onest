import {
  ALP_TOKEN_TYPE_STANDARD,
  DEFAULT_DUST_SATS,
  payment,
  toHex,
  type Script,
} from 'ecash-lib';
import type { Wallet } from 'ecash-wallet';
import {
  BASE_MINT_ATOMS,
  TOKEN_DECIMALS,
  TOKEN_NAME,
  TOKEN_TICKER,
  TOKEN_URL,
  POW_BATON_COUNT,
  POW_LEADING_ZERO_BYTES,
} from '../params/consensus.js';
import { assertMultiBaton, buildGenesisPlan } from './createGenesis.js';

export interface BroadcastGenesisOptions {
  initialMintAtoms?: bigint;
  powBatonCount?: number;
  dustSats?: bigint;
  ticker?: string;
  name?: string;
  decimals?: number;
  url?: string;
  initialMintScript?: Script;
}

export interface BroadcastGenesisResult {
  tokenId: string;
  txids: string[];
  ticker: string;
  name: string;
  decimals: number;
  initialMintAtoms: string;
  powBatonCount: number;
  powLeadingZeroBytes: number;
  baseMintAtoms: string;
  genesisAddress: string;
  authPubkey: string;
}

function batonOutputs(
  script: Script,
  count: number,
  dustSats: bigint,
): payment.PaymentOutput[] {
  const outs: payment.PaymentOutput[] = [];
  for (let i = 0; i < count; i++) {
    outs.push({
      sats: dustSats,
      script,
      tokenId: payment.GENESIS_TOKEN_ID_PLACEHOLDER,
      isMintBaton: true,
      atoms: 0n,
    });
  }
  return outs;
}

export function buildAlpGenesisAction(
  batonScript: Script,
  authPubkeyHex: string,
  opts: BroadcastGenesisOptions = {},
): payment.Action {
  const plan = buildGenesisPlan({
    ticker: opts.ticker ?? TOKEN_TICKER,
    name: opts.name ?? TOKEN_NAME,
    url: opts.url ?? TOKEN_URL,
    decimals: opts.decimals ?? TOKEN_DECIMALS,
    initialMintAtoms: opts.initialMintAtoms ?? 0n,
    powBatonCount: opts.powBatonCount ?? POW_BATON_COUNT,
  });
  assertMultiBaton(plan);

  const dustSats = opts.dustSats ?? DEFAULT_DUST_SATS;
  const mintScript = opts.initialMintScript ?? batonScript;
  const outputs: payment.PaymentOutput[] = [{ sats: 0n }];

  if (plan.initialMintAtoms > 0n) {
    outputs.push({
      sats: dustSats,
      script: mintScript,
      tokenId: payment.GENESIS_TOKEN_ID_PLACEHOLDER,
      atoms: plan.initialMintAtoms,
      isMintBaton: false,
    });
  }

  outputs.push(...batonOutputs(batonScript, plan.powBatonCount, dustSats));

  return {
    outputs,
    tokenActions: [
      {
        type: 'GENESIS',
        tokenType: ALP_TOKEN_TYPE_STANDARD,
        genesisInfo: {
          tokenTicker: plan.ticker,
          tokenName: plan.name,
          url: plan.url,
          decimals: plan.decimals,
          authPubkey: authPubkeyHex,
        },
      },
    ],
  };
}

export async function broadcastAlpGenesis(
  wallet: Wallet,
  opts: BroadcastGenesisOptions = {},
): Promise<BroadcastGenesisResult> {
  await wallet.sync();
  const authPubkeyHex = toHex(wallet.pk);
  const action = buildAlpGenesisAction(wallet.script, authPubkeyHex, opts);
  const built = wallet.action(action).build();
  const resp = await built.broadcast();
  if (!resp.success || !resp.broadcasted?.length) {
    throw new Error('ALP genesis broadcast failed');
  }

  const txids = resp.broadcasted;
  const genesisTxid = txids[0]!;
  const plan = buildGenesisPlan(opts);

  return {
    tokenId: genesisTxid,
    txids,
    ticker: plan.ticker,
    name: plan.name,
    decimals: plan.decimals,
    initialMintAtoms: plan.initialMintAtoms.toString(),
    powBatonCount: plan.powBatonCount,
    powLeadingZeroBytes: plan.powLeadingZeroBytes,
    baseMintAtoms: plan.baseMintAtoms.toString(),
    genesisAddress: wallet.address,
    authPubkey: authPubkeyHex,
  };
}
