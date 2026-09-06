#!/usr/bin/env tsx
/**
 * Genesis script for Onest (PAW) on eCash.
 *
 * Defaults:
 *   - Ticker: PAW
 *   - Name: Onest
 *   - URL: https://onest.pet
 *   - Batons: 28 PoW remint batons
 *   - Covenant: GlotusPowRemintMooreTip (felt +1 bit)
 *   - Aligned 1:1 with WLotus:
 *       - genesisUnix: 1788215242 (WLotus live genesis timestamp)
 *       - baseZeroBits: 0 (WLotus starting difficulty)
 *       - mintAtoms: 108 (WLotus 108 atoms per remint)
 *       - secondsPerExtraBit: 43200000 (500 days per bit)
 */
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { Wallet } from 'ecash-wallet';
import { Address, Script, fromHex, shaRmd160, toHex } from 'ecash-lib';
import { createChronik } from '../src/network/createChronik.js';
import { getMedianTimePast } from '../src/network/medianTimePast.js';
import { broadcastAlpGenesis } from '../src/genesis/broadcastGenesis.js';
import { createPowRemintGlotusTipContract } from '../src/covenant/powRemintGlotusTipScript.js';
import {
  PAW_MINT_ATOMS,
  PAW_GLOTUS_COVENANT,
  PAW_GLOTUS_MODE,
  WLOTUS_GENESIS_UNIX,
  POW_PAW_BASE_ZERO_BITS,
} from '../src/params/pawMint.js';
import {
  POW_BATON_COUNT,
  PAW_NAME,
  PAW_TICKER,
  PAW_URL,
} from '../src/params/consensus.js';
import { resolveFeltSecondsPerExtraBit } from '../src/covenant/mooreTip.js';

loadEnv({ path: resolve(process.cwd(), '.env') });

async function main() {
  const chronik = await createChronik();
  const mnemonic = process.env.GENESIS_MNEMONIC || process.env.MINT_MNEMONIC;
  const skHex = process.env.GENESIS_SK_HEX;

  let wallet: Wallet;
  if (mnemonic) {
    wallet = Wallet.fromMnemonic(mnemonic.trim(), chronik);
  } else if (skHex) {
    wallet = Wallet.fromSk(fromHex(skHex.trim()), chronik);
  } else {
    throw new Error('GENESIS_MNEMONIC or GENESIS_SK_HEX required in .env');
  }

  await wallet.sync();
  console.log(`Genesis wallet: ${wallet.address}`);
  console.log(`Target covenant: ${PAW_GLOTUS_COVENANT}, ticker: ${PAW_TICKER}, name: ${PAW_NAME}`);

  const mtp = await getMedianTimePast(chronik);
  // Baked-in WLotus genesis start time (1788215242, Aug 31, 2026), or env override
  const genesisUnix = Number(
    process.env.PAW_GENESIS_UNIX?.trim() || WLOTUS_GENESIS_UNIX,
  );
  // Tip locktime starts at genesisUnix or optionally at current MTP if forward-only
  const tipLocktime = Number(
    process.env.PAW_INITIAL_TIP_LOCKTIME?.trim() || genesisUnix,
  );

  console.log(`Broadcasting ALP Genesis for ${PAW_TICKER}...`);
  const genesisResult = await broadcastAlpGenesis(wallet, {
    ticker: PAW_TICKER,
    name: PAW_NAME,
    url: PAW_URL,
    initialMintAtoms: 0n,
    powBatonCount: POW_BATON_COUNT,
  });

  const tokenId = genesisResult.tokenId;
  console.log(`Token created! Token ID: ${tokenId}`);

  const secondsPerExtraBit = resolveFeltSecondsPerExtraBit();
  const baseZeroBits = POW_PAW_BASE_ZERO_BITS;

  console.log(
    `Baking covenant with WLotus parameters: genesisUnix=${genesisUnix}, baseZeroBits=${baseZeroBits}, mintAtoms=${PAW_MINT_ATOMS}, secondsPerExtraBit=${secondsPerExtraBit}, tipLocktime=${tipLocktime}`,
  );

  const contract = await createPowRemintGlotusTipContract({
    tokenId,
    mintAtoms: PAW_MINT_ATOMS,
    genesisUnix,
    baseZeroBits,
    secondsPerExtraBit,
    tipLocktime,
  });

  console.log(`Covenant P2SH address: ${contract.address}`);

  const deploymentData = {
    tokenId,
    ticker: PAW_TICKER,
    name: PAW_NAME,
    url: PAW_URL,
    genesisTxid: tokenId,
    genesisUnix,
    baseZeroBits,
    secondsPerExtraBit,
    covenant: PAW_GLOTUS_COVENANT,
    mode: PAW_GLOTUS_MODE,
    powAddress: contract.address,
    powScriptHashHex: toHex(contract.scriptHash),
    redeemHex: contract.redeemHex,
    batonCount: POW_BATON_COUNT,
    wlotusAligned: true,
    wlotusGenesisUnix: WLOTUS_GENESIS_UNIX,
    mintAtoms: PAW_MINT_ATOMS.toString(),
    createdAt: new Date().toISOString(),
  };

  mkdirSync(resolve(process.cwd(), 'deployments'), { recursive: true });
  const outPath = resolve(process.cwd(), 'deployments/mainnet-paw.json');
  writeFileSync(outPath, JSON.stringify(deploymentData, null, 2) + '\n');
  console.log(`Saved deployment info to ${outPath}`);
}

main().catch(err => {
  console.error('Genesis failed:', err);
  process.exit(1);
});
