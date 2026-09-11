import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PAW_NAME, PAW_TICKER } from './consensus.js';

export interface CliOptions {
  isTest: boolean;
  ticker?: string;
  name?: string;
  outPath?: string;
  addressOnly: boolean;
  force: boolean;
  skipHandoff: boolean;
  help: boolean;
}

export interface ResolvedTokenConfig {
  isTest: boolean;
  ticker: string;
  name: string;
  outPath: string;
  addressOnly: boolean;
  force: boolean;
  skipHandoff: boolean;
}

/**
 * Resolve the desk/genesis mnemonic from env.
 * `TEST_DESK_SEEDS` is the Cursor/GitHub secret for the test desk; it may be a
 * quoted phrase, a JSON string, or a JSON array (first entry wins).
 */
export function parseDeskSeed(raw?: string): string {
  let s = (raw ?? '').trim();
  if (!s) return '';
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (typeof parsed === 'string') s = parsed;
      else if (Array.isArray(parsed)) {
        const first = parsed.find(x => typeof x === 'string' && x.trim());
        s = typeof first === 'string' ? first : '';
      } else if (parsed && typeof parsed === 'object') {
        const rec = parsed as Record<string, unknown>;
        const candidate =
          rec.mnemonic ?? rec.seed ?? rec.MINT_MNEMONIC ?? rec.desk;
        s = typeof candidate === 'string' ? candidate : '';
      }
    } catch {
      /* treat as a raw phrase */
    }
  }
  const phrase = s.trim().split(/\s+/).join(' ');
  const words = phrase.split(' ').filter(Boolean);
  if (words.length !== 12 && words.length !== 24) {
    throw new Error(
      `Desk seed must be a 12- or 24-word mnemonic (got ${words.length} words)`,
    );
  }
  return phrase;
}

export function resolveDeskMnemonic(): string {
  return parseDeskSeed(
    process.env.TEST_DESK_SEEDS ||
      process.env.GENESIS_MNEMONIC ||
      process.env.MINT_MNEMONIC,
  );
}

export function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    isTest: false,
    addressOnly: false,
    force: false,
    skipHandoff: false,
    help: false,
  };

  // Check env flag for test token
  const envTest = process.env.TEST_TOKEN || process.env.PAW_TEST || process.env.TOKEN_MODE;
  if (
    envTest &&
    (envTest === '1' || envTest.toLowerCase() === 'true' || envTest.toLowerCase() === 'test')
  ) {
    opts.isTest = true;
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (
      arg === '--test' ||
      arg === '-t' ||
      arg === 'test' ||
      arg.toLowerCase() === 'tpaw' ||
      arg === '--testnet'
    ) {
      opts.isTest = true;
    } else if (
      arg === '--prod' ||
      arg === '-p' ||
      arg === 'prod' ||
      arg.toUpperCase() === 'PAW' ||
      arg === '--mainnet'
    ) {
      opts.isTest = false;
    } else if (
      arg === '--address' ||
      arg === '--check' ||
      arg === '--info' ||
      arg === '--dry-run'
    ) {
      opts.addressOnly = true;
    } else if (arg === '--force' || arg === '-f') {
      opts.force = true;
    } else if (arg === '--skip-handoff') {
      opts.skipHandoff = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg.startsWith('--ticker=')) {
      opts.ticker = arg.slice(9).trim();
    } else if (arg === '--ticker' && i + 1 < args.length) {
      opts.ticker = args[++i]!.trim();
    } else if (arg.startsWith('--name=')) {
      opts.name = arg.slice(7).trim();
    } else if (arg === '--name' && i + 1 < args.length) {
      opts.name = args[++i]!.trim();
    } else if (arg.startsWith('--out=')) {
      opts.outPath = arg.slice(6).trim();
    } else if (arg === '--out' && i + 1 < args.length) {
      opts.outPath = args[++i]!.trim();
    }
  }

  return opts;
}

export function resolveTokenConfig(opts: CliOptions): ResolvedTokenConfig {
  const isTest = opts.isTest;
  const defaultTicker = isTest ? 'tPAW' : PAW_TICKER;
  const defaultName = isTest ? 'Onest Test' : PAW_NAME;
  const defaultOutFile = isTest
    ? 'deployments/test-paw.json'
    : 'deployments/mainnet-paw.json';

  const ticker =
    opts.ticker ||
    process.env.TOKEN_TICKER ||
    process.env.PAW_TICKER ||
    defaultTicker;
  const name =
    opts.name || process.env.TOKEN_NAME || process.env.PAW_NAME || defaultName;
  const outPath = resolve(
    process.cwd(),
    opts.outPath || process.env.DEPLOYMENT_OUT || defaultOutFile,
  );

  return {
    isTest,
    ticker,
    name,
    outPath,
    addressOnly: opts.addressOnly,
    force: opts.force,
    skipHandoff: opts.skipHandoff,
  };
}

export function updateEnvFile(
  filePath: string,
  updates: Record<string, string>,
): void {
  let content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  for (const [key, val] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  }
  writeFileSync(filePath, content.trim() + '\n', 'utf8');
}

export function printUsage(): void {
  console.log(`
Onest Genesis & Token Creation Script
====================================
Creates ALP genesis and bakes WLotus remint covenant for Onest tokens.

Usage:
  npm run create-paw-token -- [options]

Modes:
  --test, -t, test         Create test token tPAW (name: "Onest Test", output: deployments/test-paw.json)
  --prod, -p, prod         Create production token PAW (name: "Onest", output: deployments/mainnet-paw.json)
  --address, --check       Inspect genesis address, funding balance, and status without broadcasting

Configuration Options:
  --ticker <symbol>        Custom token ticker (e.g. tPAW, PAW)
  --name <name>            Custom token name (e.g. "Onest Test", "Onest")
  --out <path>             Custom deployment output JSON file path
  --force                  Overwrite existing deployment file if token already created
  --skip-handoff           Skip automatic baton 0 handoff to covenant P2SH address
  --help, -h               Show this help message

Examples:
  # Check wallet address and funding balance:
  npm run create-paw-token -- --address

  # Create test token tPAW:
  npm run create-paw-token -- --test

  # Create production token PAW:
  npm run create-paw-token -- --prod
`);
}
