#!/usr/bin/env tsx
/**
 * Genesis and deployment script for Onest tokens (PAW / tPAW) on eCash.
 *
 * Supports both test (tPAW) and production (PAW) tokens via CLI parameter:
 *   - Test token:  npm run create-paw-token -- --test
 *   - Prod token:  npm run create-paw-token -- --prod
 *   - Check mode:  npm run create-paw-token -- --address
 *
 * Parameters:
 *   --test, -t, test, tPAW     Create test token tPAW (name: "Onest Test", output: deployments/test-paw.json)
 *   --prod, -p, prod, PAW      Create prod token PAW (name: "Onest", output: deployments/mainnet-paw.json)
 *   --address, --check, --info Print wallet address, funding balance, and status without broadcasting
 *   --ticker <str>             Override token ticker
 *   --name <str>               Override token name
 *   --out <path>               Override deployment output JSON path
 *   --force                    Overwrite existing deployment file if already created
 *   --skip-handoff             Skip handing off baton 0 to covenant contract
 *   --help, -h                 Print usage help
 *
 * Covenant alignment (1:1 with live WLotus):
 *   - genesisUnix: 1788215242
 *   - baseZeroBits: 0
 *   - mintAtoms: 108
 *   - secondsPerExtraBit: 43200000 (500 days per bit)
 *   - Batons: 28 PoW remint batons
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import * as bip39 from 'bip39';
import { Wallet } from 'ecash-wallet';
import {
  toHex,
  fromHex,
  ALP_TOKEN_TYPE_STANDARD,
  DEFAULT_DUST_SATS,
  type payment,
} from 'ecash-lib';
import { createChronik } from '../src/network/createChronik.js';
import { getMedianTimePast } from '../src/network/medianTimePast.js';
import { broadcastAlpGenesis } from '../src/genesis/broadcastGenesis.js';
import { createPowRemintWLotusCovenantContract } from '../src/covenant/powRemintWLotusCovenantScript.js';
import {
  PAW_MINT_ATOMS,
  PAW_WLOTUS_COVENANT,
  PAW_WLOTUS_MODE,
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
import { pureXecBalance } from '../src/mint/fuelUtxo.js';

import {
  parseArgs,
  resolveTokenConfig,
  updateEnvFile,
  printUsage,
  parseDeskSeed,
  type CliOptions,
} from '../src/params/tokenCli.js';

function loadOrCreateMnemonic(envPath: string, isTest: boolean): { mnemonic: string; isNew: boolean } {
  const fromSecret = (isTest ? process.env.TEST_DESK_SEEDS : process.env.PROD_DESK_SEEDS)?.trim();
  if (fromSecret) {
    const mnemonic = parseDeskSeed(fromSecret);
    process.env.MINT_MNEMONIC = mnemonic;
    process.env.GENESIS_MNEMONIC = mnemonic;
    return { mnemonic, isNew: false };
  }

  const existing = (process.env.GENESIS_MNEMONIC || process.env.MINT_MNEMONIC)?.trim();
  if (existing) {
    return { mnemonic: parseDeskSeed(existing), isNew: false };
  }

  // Generate fresh 12-word BIP39 mnemonic
  const mnemonic = bip39.generateMnemonic(128);

  // Read template from .env.example if .env does not exist yet
  let baseContent = '';
  if (!existsSync(envPath)) {
    const examplePath = resolve(process.cwd(), '.env.example');
    if (existsSync(examplePath)) {
      baseContent = readFileSync(examplePath, 'utf8');
    }
  } else {
    baseContent = readFileSync(envPath, 'utf8');
  }

  // Set MINT_MNEMONIC and GENESIS_MNEMONIC
  if (/^MINT_MNEMONIC=/m.test(baseContent)) {
    baseContent = baseContent.replace(/^MINT_MNEMONIC=.*$/m, `MINT_MNEMONIC="${mnemonic}"`);
  } else {
    baseContent += `\nMINT_MNEMONIC="${mnemonic}"`;
  }
  if (/^GENESIS_MNEMONIC=/m.test(baseContent)) {
    baseContent = baseContent.replace(/^GENESIS_MNEMONIC=.*$/m, `GENESIS_MNEMONIC="${mnemonic}"`);
  } else {
    baseContent += `\nGENESIS_MNEMONIC="${mnemonic}"`;
  }

  writeFileSync(envPath, baseContent.trim() + '\n', 'utf8');
  process.env.MINT_MNEMONIC = mnemonic;
  process.env.GENESIS_MNEMONIC = mnemonic;

  return { mnemonic, isNew: true };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) {
    printUsage();
    return;
  }

  const envPath = resolve(process.cwd(), '.env');
  loadEnv({ path: envPath });

  // Resolve token parameters
  const cfg = resolveTokenConfig(opts);
  const isTest = cfg.isTest;
  const ticker = cfg.ticker;
  const name = cfg.name;
  const outPath = cfg.outPath;

  // Check if already deployed
  if (existsSync(outPath) && !opts.force && !opts.addressOnly) {
    try {
      const existing = JSON.parse(readFileSync(outPath, 'utf8'));
      if (existing.tokenId) {
        console.log(`\n[!] Deployment already exists at: ${outPath}`);
        console.log(`    Token ID: ${existing.tokenId}`);
        console.log(`    Ticker:   ${existing.ticker}`);
        console.log(`    Name:     ${existing.name}`);
        console.log(`    Covenant: ${existing.powAddress || existing.covenant}`);
        console.log(`\nUse --force to overwrite and generate a new token.\n`);
        return;
      }
    } catch {
      // Continue if unparseable
    }
  }

  // Load or generate wallet
  const skHex = (process.env.GENESIS_SK_HEX || process.env.MINT_SK_HEX)?.trim();
  const chronik = await createChronik();

  let wallet: Wallet;
  let sourceDesc: string;

  if (skHex) {
    wallet = Wallet.fromSk(fromHex(skHex), chronik);
    sourceDesc = 'private key (GENESIS_SK_HEX / MINT_SK_HEX)';
  } else {
    const { mnemonic, isNew } = loadOrCreateMnemonic(envPath, isTest);
    if (isNew) {
      console.log('\n' + '='.repeat(70));
      console.log('  GENERATED NEW GENESIS & MINT DESK MNEMONIC (12 words):');
      console.log(`  "${mnemonic}"`);
      console.log('  Saved to .env as MINT_MNEMONIC and GENESIS_MNEMONIC.');
      console.log('  IMPORTANT: Back up this seed phrase securely!');
      console.log('='.repeat(70));
    }
    wallet = Wallet.fromMnemonic(mnemonic.trim(), chronik);
    sourceDesc = isNew
      ? 'newly generated mnemonic (.env)'
      : (isTest ? process.env.TEST_DESK_SEEDS : process.env.PROD_DESK_SEEDS)?.trim()
        ? isTest
          ? 'TEST_DESK_SEEDS'
          : 'PROD_DESK_SEEDS'
        : 'mnemonic from .env';
  }

  await wallet.sync();

  const balanceSats = pureXecBalance(wallet.utxos);
  const balanceXec = Number(balanceSats) / 100;

  // Minimum funding required:
  // - 28 baton dust outputs = 28 * 546 sats = 15,288 sats (~153 XEC)
  // - Covenant handoff dust output = 546 sats
  // - Miner tx fees = ~2,000 sats
  // Total minimum for genesis + handoff = ~18,000 sats (180 XEC), safe threshold = 20,000 sats (200 XEC).
  const MIN_GENESIS_SATS = 20_000n;
  const RECOMMENDED_DESK_XEC = '1,000–5,000';

  console.log('\n' + '='.repeat(70));
  console.log(`  ONEST TOKEN GENESIS & DESK FUNDING`);
  console.log('='.repeat(70));
  console.log(`  Mode:             ${isTest ? 'TESTNET / TEST TOKEN (tPAW)' : 'MAINNET / PRODUCTION TOKEN (PAW)'}`);
  console.log(`  Ticker:           ${ticker}`);
  console.log(`  Name:             ${name}`);
  console.log(`  URL:              ${PAW_URL}`);
  console.log(`  Deployment Out:   ${outPath}`);
  console.log(`  Wallet Source:    ${sourceDesc}`);
  console.log(`  Genesis Address:  ${wallet.address}`);
  console.log(`  Current Balance:  ${balanceSats.toLocaleString()} sats (${balanceXec.toLocaleString()} XEC)`);
  console.log(`  UTXO Count:       ${wallet.utxos.length}`);
  console.log('='.repeat(70));

  // Address-only inspection mode
  if (opts.addressOnly) {
    console.log(`\n[i] Address inspection mode.`);
    console.log(`    To fund this wallet for token genesis & desk operations:`);
    console.log(`    1. Send XEC to: ${wallet.address}`);
    console.log(`    2. Minimum for token genesis:  200 XEC (20,000 sats)`);
    console.log(`    3. Recommended for Mint Desk:  ${RECOMMENDED_DESK_XEC} XEC (fuel & postage reserve)`);
    console.log(`    4. Once funded, run:`);
    console.log(`       npm run create-paw-token -- ${isTest ? '--test' : '--prod'}\n`);
    return;
  }

  // Pre-broadcast funding check
  if (balanceSats < MIN_GENESIS_SATS) {
    console.log(`\n[!] Insufficient balance in genesis wallet to broadcast token creation.`);
    console.log(`    Address to fund:   ${wallet.address}`);
    console.log(`    Current balance:   ${balanceXec.toLocaleString()} XEC (${balanceSats.toLocaleString()} sats)`);
    console.log(`    Minimum required:  200 XEC (20,000 sats)`);
    console.log(`    Recommended:       ${RECOMMENDED_DESK_XEC} XEC (for genesis + desk remint fuel reserve)`);
    console.log(`\nPlease send at least 200 XEC to ${wallet.address} and then run:`);
    console.log(`  npm run create-paw-token -- ${isTest ? '--test' : '--prod'}\n`);
    process.exit(1);
  }

  // Fetch Median Time Past (MTP)
  const mtp = await getMedianTimePast(chronik);
  const genesisUnix = Number(
    process.env.PAW_GENESIS_UNIX?.trim() || WLOTUS_GENESIS_UNIX,
  );
  const tipLocktime = Number(
    process.env.PAW_INITIAL_TIP_LOCKTIME?.trim() || genesisUnix,
  );

  console.log(`\n[1/3] Broadcasting ALP Genesis for ${ticker} (${name})...`);
  const genesisResult = await broadcastAlpGenesis(wallet, {
    ticker,
    name,
    url: PAW_URL,
    initialMintAtoms: 0n,
    powBatonCount: POW_BATON_COUNT,
  });

  const tokenId = genesisResult.tokenId;
  console.log(`      [✓] Genesis broadcasted! Token ID: ${tokenId}`);

  const secondsPerExtraBit = resolveFeltSecondsPerExtraBit();
  const baseZeroBits = POW_PAW_BASE_ZERO_BITS;

  console.log(`\n[2/3] Baking WLotus remint covenant contract...`);
  console.log(
    `      genesisUnix=${genesisUnix}, baseZeroBits=${baseZeroBits}, mintAtoms=${PAW_MINT_ATOMS}, secondsPerExtraBit=${secondsPerExtraBit}, tipLocktime=${tipLocktime}`,
  );

  const contract = await createPowRemintWLotusCovenantContract({
    tokenId,
    mintAtoms: PAW_MINT_ATOMS,
    genesisUnix,
    baseZeroBits,
    secondsPerExtraBit,
    tipLocktime,
  });

  console.log(`      [✓] Covenant P2SH address: ${contract.address}`);

  // Hand off baton 0 to covenant contract
  let handoffTxid: string | null = null;
  if (!opts.skipHandoff) {
    console.log(`\n[3/3] Handing off mint baton 0 to covenant P2SH address...`);
    // Wait briefly for chronik to register genesis mempool UTXOs
    let batonFound = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      await wallet.sync();
      const hasBaton = wallet.utxos.some(
        u => u.token?.tokenId?.toLowerCase() === tokenId.toLowerCase() && u.token?.isMintBaton,
      );
      if (hasBaton) {
        batonFound = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (batonFound) {
      try {
        const handoffAction: payment.Action = {
          outputs: [
            { sats: 0n },
            {
              sats: DEFAULT_DUST_SATS,
              script: contract.p2shScript,
              tokenId,
              isMintBaton: true,
              atoms: 0n,
            },
          ],
          tokenActions: [
            { type: 'MINT', tokenId, tokenType: ALP_TOKEN_TYPE_STANDARD },
          ],
        };

        const builtHandoff = wallet.action(handoffAction).build();
        const handoffResp = await builtHandoff.broadcast();
        handoffTxid = handoffResp.broadcasted?.[0] ?? null;
        console.log(`      [✓] Baton handoff broadcasted! TxID: ${handoffTxid}`);
      } catch (err) {
        console.warn(`      [!] Handoff warning (can be reminted directly): ${err instanceof Error ? err.message : err}`);
      }
    } else {
      console.warn(`      [!] Mint baton not indexed yet; covenant can be reminted once mempool syncs.`);
    }
  } else {
    console.log(`\n[3/3] Skipped baton handoff (--skip-handoff specified).`);
  }

  // Save deployment artifact
  const deploymentData = {
    tokenId,
    ticker,
    name,
    url: PAW_URL,
    genesisTxid: tokenId,
    handoffTxid,
    genesisUnix,
    baseZeroBits,
    secondsPerExtraBit,
    covenant: PAW_WLOTUS_COVENANT,
    mode: PAW_WLOTUS_MODE,
    powAddress: contract.address,
    powScriptHashHex: toHex(contract.scriptHash),
    redeemHex: contract.redeemHex,
    batonCount: POW_BATON_COUNT,
    wlotusAligned: true,
    wlotusGenesisUnix: WLOTUS_GENESIS_UNIX,
    mintAtoms: PAW_MINT_ATOMS.toString(),
    isTest,
    createdAt: new Date().toISOString(),
  };

  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(deploymentData, null, 2) + '\n');
  console.log(`\n[✓] Saved deployment metadata to: ${outPath}`);

  // Automatically update .env with newly created token details
  try {
    updateEnvFile(envPath, {
      TOKEN_ID: tokenId,
      VITE_PAW_TOKEN_ID: tokenId,
      VITE_PRAYER_TOKEN_ID: tokenId,
      VITE_PAW_TICKER: ticker,
      DEPLOYMENT_JSON: outPath,
    });
    console.log(`[✓] Updated ${envPath} with TOKEN_ID=${tokenId} and VITE_PAW_TICKER=${ticker}`);
  } catch (err) {
    console.warn(`[!] Note: Could not update .env automatically: ${err instanceof Error ? err.message : err}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  TOKEN CREATION COMPLETE!`);
  console.log('='.repeat(70));
  console.log(`  Ticker:          ${ticker}`);
  console.log(`  Name:            ${name}`);
  console.log(`  Token ID:        ${tokenId}`);
  console.log(`  Covenant P2SH:   ${contract.address}`);
  console.log(`  Handoff TxID:    ${handoffTxid ?? 'N/A'}`);
  console.log(`  Deployment JSON: ${outPath}`);
  console.log('='.repeat(70));
  console.log(`\nNext Steps:`);
  console.log(`  1. Keep desk funded at ${wallet.address} with ${RECOMMENDED_DESK_XEC} XEC`);
  console.log(`  2. Restart mint-api and dana-index to load the new token:`);
  console.log(`     npm run mint-api`);
  console.log(`     npm run dana-index\n`);
}

export { main };

const isDirectRun = Boolean(
  process.argv[1] &&
  (resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
   process.argv[1].endsWith('create-paw-token.ts'))
);

if (isDirectRun) {
  main().catch(err => {
    console.error('\n[X] Genesis failed:', err);
    process.exit(1);
  });
}
