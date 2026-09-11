import { jest } from '@jest/globals';
import type { Wallet } from 'ecash-wallet';

// ecash-lib ships wasm with ESM that jest cannot load; burnPaw only needs
// this one runtime constant. Everything else there is type-only.
jest.unstable_mockModule('ecash-lib', () => ({
  ALP_TOKEN_TYPE_STANDARD: 0,
  DEFAULT_DUST_SATS: 546n,
  Script: class Script {},
}));

let burnOnePaw: typeof import('../src/offering/burnPaw.js')['burnOnePaw'];

beforeAll(async () => {
  ({ burnOnePaw } = await import('../src/offering/burnPaw.js'));
});

const TOKEN = 'a4'.repeat(32);
const DESK = 'ecash:qqqdeskaddress';
const TXID = '11'.repeat(32);

interface CapturedAction {
  outputs: unknown[];
  tokenActions: Array<{ type: string; burnAtoms?: bigint }>;
  requiredUtxos: Array<{ txid: string; outIdx: number }>;
}

function fakeWallet(captured: { action?: CapturedAction }): Wallet {
  const script = { bytecode: new Uint8Array() };
  const wallet = {
    sync: async () => undefined,
    utxos: [
      {
        outpoint: { txid: 'aa'.repeat(32), outIdx: 0 },
        sats: 546n,
        token: { tokenId: TOKEN, atoms: 108n },
      },
      {
        outpoint: { txid: 'bb'.repeat(32), outIdx: 1 },
        sats: 2_500n,
      },
    ],
    script,
    getChangeScript: () => script,
    action: (args: CapturedAction) => {
      captured.action = args;
      return {
        build: () => ({
          broadcast: async () => ({ broadcasted: [TXID] }),
        }),
      };
    },
  };
  return wallet as unknown as Wallet;
}

describe('user-paid burn with listing fee', () => {
  it('burns 1 atom, sends the fee to the desk and stamps the note', async () => {
    const captured: { action?: CapturedAction } = {};
    const result = await burnOnePaw({
      wallet: fakeWallet(captured),
      tokenId: TOKEN,
      note: 'Bella',
      burnAtoms: 1n,
      feeAtoms: 6n,
      feeAddress: DESK,
    });

    expect(result).toEqual({ txid: TXID, burnAtoms: 1n, feeAtoms: 6n });
    const action = captured.action!;
    const burn = action.tokenActions.find(a => a.type === 'BURN');
    expect(burn?.burnAtoms).toBe(1n);
    expect(action.tokenActions.some(a => a.type === 'SEND')).toBe(true);
    expect(action.tokenActions.some(a => a.type === 'DATA')).toBe(true);

    const feeOutput = action.outputs.find(
      (o): o is { atoms: bigint; address: string } =>
        typeof o === 'object' && o !== null && (o as { atoms?: bigint }).atoms === 6n,
    );
    expect(feeOutput?.address).toBe(DESK);
    expect(action.requiredUtxos).toHaveLength(2);
  });

  it('omits the fee output for sponsored burns', async () => {
    const captured: { action?: CapturedAction } = {};
    const result = await burnOnePaw({
      wallet: fakeWallet(captured),
      tokenId: TOKEN,
      note: 'Tribute',
      burnAtoms: 1n,
    });
    expect(result.feeAtoms).toBe(0n);
    expect(captured.action!.tokenActions.some(a => a.type === 'SEND')).toBe(false);
    expect(captured.action!.outputs).toHaveLength(1);
  });

  it('requires a desk address when a fee is requested', async () => {
    await expect(
      burnOnePaw({
        wallet: fakeWallet({}),
        tokenId: TOKEN,
        note: 'x',
        feeAtoms: 6n,
      }),
    ).rejects.toThrow(/feeAddress/i);
  });

  it('rejects a wallet that cannot cover burn + fee', async () => {
    const captured: { action?: CapturedAction } = {};
    const wallet = fakeWallet(captured);
    (wallet as unknown as { utxos: unknown[] }).utxos = [
      {
        outpoint: { txid: 'cc'.repeat(32), outIdx: 0 },
        sats: 546n,
        token: { tokenId: TOKEN, atoms: 3n },
      },
      {
        outpoint: { txid: 'bb'.repeat(32), outIdx: 1 },
        sats: 2_500n,
      },
    ];
    await expect(
      burnOnePaw({
        wallet,
        tokenId: TOKEN,
        note: 'x',
        burnAtoms: 1n,
        feeAtoms: 6n,
        feeAddress: DESK,
      }),
    ).rejects.toThrow(/Need >= 7 atoms/);
  });
});
