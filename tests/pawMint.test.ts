import {
  PAW_MINT_ATOMS,
  PAW_MINER_ATOMS,
  PAW_FELT_COVENANT,
  PAW_MOORE_TIP_COVENANT,
  isPawFeltCovenant,
  isPawMooreTipCovenant,
  resolvePawGenesisRegime,
} from '../src/params/pawMint.js';
import {
  PAW_TICKER,
  PAW_NAME,
  PAW_URL,
} from '../src/params/consensus.js';

describe('pawMint & consensus', () => {
  it('has matching 100 atoms for both mint and miner with no temple tax', () => {
    expect(PAW_MINT_ATOMS).toBe(100n);
    expect(PAW_MINER_ATOMS).toBe(100n);
    expect(PAW_MINER_ATOMS).toBe(PAW_MINT_ATOMS);
  });

  it('has Onest branding', () => {
    expect(PAW_TICKER).toBe('PAW');
    expect(PAW_NAME).toBe('Onest');
    expect(PAW_URL).toBe('https://onest.pet');
  });

  it('identifies covenants correctly', () => {
    expect(isPawFeltCovenant({ covenant: PAW_FELT_COVENANT })).toBe(true);
    expect(isPawMooreTipCovenant({ covenant: PAW_MOORE_TIP_COVENANT })).toBe(true);
    expect(isPawFeltCovenant({ covenant: 'Unknown' })).toBe(false);
  });

  it('resolves regimes according to env', () => {
    expect(resolvePawGenesisRegime({ REGIME: 'felt' })).toBe('felt');
    expect(resolvePawGenesisRegime({ REGIME: 'moore-tip' })).toBe('moore-tip');
    expect(resolvePawGenesisRegime({ REGIME: 'memo' })).toBe('memo');
    expect(resolvePawGenesisRegime({})).toBe('felt');
  });
});
