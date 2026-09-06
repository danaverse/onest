import {
  PAW_MINT_ATOMS,
  PAW_MINER_ATOMS,
  PAW_COVENANT,
  PAW_WLOTUS_COVENANT,
  PAW_FELT_COVENANT,
  PAW_GLOTUS_COVENANT,
  WLOTUS_GENESIS_UNIX,
  POW_PAW_BASE_ZERO_BITS,
  isPawWLotusCovenant,
  isPawFeltCovenant,
  isPawGlotusCovenant,
  resolvePawGenesisRegime,
} from '../src/params/pawMint.js';
import {
  PAW_TICKER,
  PAW_NAME,
  PAW_URL,
  PAW_GENESIS_UNIX,
  MOORE_DAYS_PER_EXTRA_BIT,
  POW_BATON_COUNT,
} from '../src/params/consensus.js';
import { computeMooreTipState } from '../src/covenant/mooreTip.js';

describe('pawMint & consensus (WLotusCovenant model aligned 1:1 with WLotus)', () => {
  it('has matching 108 atoms for both mint and miner with no temple tax', () => {
    expect(PAW_MINT_ATOMS).toBe(108n);
    expect(PAW_MINER_ATOMS).toBe(108n);
    expect(PAW_MINER_ATOMS).toBe(PAW_MINT_ATOMS);
  });

  it('has baked-in WLotus genesis start time and difficulty parameters', () => {
    expect(WLOTUS_GENESIS_UNIX).toBe(1788215242);
    expect(PAW_GENESIS_UNIX).toBe(1788215242);
    expect(POW_PAW_BASE_ZERO_BITS).toBe(0);
    expect(MOORE_DAYS_PER_EXTRA_BIT).toBe(500);
    expect(POW_BATON_COUNT).toBe(28);
  });

  it('computes Moore tip state aligned with WLotus genesis clock', () => {
    const tipAtGenesis = computeMooreTipState(WLOTUS_GENESIS_UNIX, {
      genesisUnix: WLOTUS_GENESIS_UNIX,
      baseZeroBits: POW_PAW_BASE_ZERO_BITS,
      secondsPerExtraBit: 500 * 86_400,
      tipLocktime: WLOTUS_GENESIS_UNIX,
    });
    expect(tipAtGenesis.bits).toBe(0);
    expect(tipAtGenesis.extraBits).toBe(0);

    // After 500 days (1 extra bit)
    const tipAfter500Days = computeMooreTipState(
      WLOTUS_GENESIS_UNIX + 500 * 86_400,
      {
        genesisUnix: WLOTUS_GENESIS_UNIX,
        baseZeroBits: POW_PAW_BASE_ZERO_BITS,
        secondsPerExtraBit: 500 * 86_400,
        tipLocktime: WLOTUS_GENESIS_UNIX,
      },
    );
    expect(tipAfter500Days.bits).toBe(1);
    expect(tipAfter500Days.extraBits).toBe(1);
  });

  it('has Onest branding', () => {
    expect(PAW_TICKER).toBe('PAW');
    expect(PAW_NAME).toBe('Onest');
    expect(PAW_URL).toBe('https://onest.pet');
  });

  it('identifies WLotusCovenant covenant correctly', () => {
    expect(PAW_COVENANT).toBe('WLotusCovenant');
    expect(PAW_WLOTUS_COVENANT).toBe('WLotusCovenant');
    expect(isPawWLotusCovenant({ covenant: PAW_WLOTUS_COVENANT })).toBe(true);
    expect(isPawFeltCovenant({ covenant: PAW_FELT_COVENANT })).toBe(true);
    expect(isPawGlotusCovenant({ covenant: PAW_GLOTUS_COVENANT })).toBe(true);
    expect(isPawWLotusCovenant({ covenant: 'WlotusPowRemintMooreTip' })).toBe(false);
    expect(isPawWLotusCovenant({ covenant: 'Unknown' })).toBe(false);
  });

  it('resolves regime to WLotusCovenant', () => {
    expect(resolvePawGenesisRegime({ REGIME: 'wlotus' })).toBe('wlotus');
    expect(resolvePawGenesisRegime({})).toBe('wlotus');
  });
});
