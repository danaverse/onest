import {
  parseArgs,
  resolveTokenConfig,
  updateEnvFile,
} from '../src/params/tokenCli.js';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

describe('create-paw-token CLI argument parsing & config resolution', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.TEST_TOKEN;
    delete process.env.PAW_TEST;
    delete process.env.TOKEN_MODE;
    delete process.env.TOKEN_TICKER;
    delete process.env.TOKEN_NAME;
    delete process.env.DEPLOYMENT_OUT;
  });

  afterAll(() => {
    process.env = origEnv;
  });

  it('defaults to prod mode when no flags are passed', () => {
    const opts = parseArgs([]);
    expect(opts.isTest).toBe(false);
    expect(opts.addressOnly).toBe(false);
    expect(opts.force).toBe(false);
    expect(opts.skipHandoff).toBe(false);

    const cfg = resolveTokenConfig(opts);
    expect(cfg.isTest).toBe(false);
    expect(cfg.ticker).toBe('PAW');
    expect(cfg.name).toBe('Onest');
    expect(cfg.outPath.replaceAll('\\', '/')).toContain('deployments/mainnet-paw.json');
  });

  it('parses --test flag as test mode with tPAW and test-paw.json', () => {
    const opts = parseArgs(['--test']);
    expect(opts.isTest).toBe(true);

    const cfg = resolveTokenConfig(opts);
    expect(cfg.isTest).toBe(true);
    expect(cfg.ticker).toBe('tPAW');
    expect(cfg.name).toBe('Onest Test');
    expect(cfg.outPath.replaceAll('\\', '/')).toContain('deployments/test-paw.json');
  });

  it('parses -t and positional "test" and "tPAW"', () => {
    expect(parseArgs(['-t']).isTest).toBe(true);
    expect(parseArgs(['test']).isTest).toBe(true);
    expect(parseArgs(['tPAW']).isTest).toBe(true);
    expect(parseArgs(['tpaw']).isTest).toBe(true);
    expect(parseArgs(['--testnet']).isTest).toBe(true);
  });

  it('parses --prod flag as prod mode', () => {
    expect(parseArgs(['--prod']).isTest).toBe(false);
    expect(parseArgs(['-p']).isTest).toBe(false);
    expect(parseArgs(['prod']).isTest).toBe(false);
    expect(parseArgs(['PAW']).isTest).toBe(false);
    expect(parseArgs(['--mainnet']).isTest).toBe(false);
  });

  it('respects TEST_TOKEN and PAW_TEST environment variables', () => {
    process.env.TEST_TOKEN = '1';
    expect(parseArgs([]).isTest).toBe(true);

    process.env.TEST_TOKEN = 'true';
    expect(parseArgs([]).isTest).toBe(true);

    delete process.env.TEST_TOKEN;
    process.env.PAW_TEST = '1';
    expect(parseArgs([]).isTest).toBe(true);
  });

  it('parses address and inspection flags', () => {
    expect(parseArgs(['--address']).addressOnly).toBe(true);
    expect(parseArgs(['--check']).addressOnly).toBe(true);
    expect(parseArgs(['--info']).addressOnly).toBe(true);
    expect(parseArgs(['--dry-run']).addressOnly).toBe(true);
  });

  it('parses custom ticker, name, and outPath overrides', () => {
    const opts1 = parseArgs([
      '--test',
      '--ticker=MYTEST',
      '--name=Custom Test',
      '--out=deployments/custom.json',
    ]);
    expect(opts1.isTest).toBe(true);
    expect(opts1.ticker).toBe('MYTEST');
    expect(opts1.name).toBe('Custom Test');
    expect(opts1.outPath).toBe('deployments/custom.json');

    const cfg1 = resolveTokenConfig(opts1);
    expect(cfg1.ticker).toBe('MYTEST');
    expect(cfg1.name).toBe('Custom Test');
    expect(cfg1.outPath.replaceAll('\\', '/')).toContain('deployments/custom.json');

    const opts2 = parseArgs([
      '--ticker',
      'ALT',
      '--name',
      'Alt Name',
      '--out',
      'alt.json',
    ]);
    expect(opts2.ticker).toBe('ALT');
    expect(opts2.name).toBe('Alt Name');
    expect(opts2.outPath).toBe('alt.json');
  });

  it('parses modifier flags: --force, --skip-handoff, --help', () => {
    const opts = parseArgs(['--force', '--skip-handoff', '--help']);
    expect(opts.force).toBe(true);
    expect(opts.skipHandoff).toBe(true);
    expect(opts.help).toBe(true);
  });
});

describe('updateEnvFile helper', () => {
  const tempEnv = resolve(tmpdir(), 'onest-test-temp.env');

  afterEach(() => {
    if (existsSync(tempEnv)) {
      unlinkSync(tempEnv);
    }
  });

  it('creates and updates environment keys preserving other lines', () => {
    writeFileSync(tempEnv, '# Comment\nFOO=old\nBAR=keep\n', 'utf8');

    updateEnvFile(tempEnv, {
      FOO: 'new',
      NEW_KEY: 'created',
    });

    const content = readFileSync(tempEnv, 'utf8');
    expect(content).toContain('# Comment');
    expect(content).toContain('FOO=new');
    expect(content).toContain('BAR=keep');
    expect(content).toContain('NEW_KEY=created');
  });
});
