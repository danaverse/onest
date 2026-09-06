import {
  PAW_MINT_ATOMS,
  PAW_MINER_ATOMS,
  PAW_FELT_COVENANT,
  PAW_GLOTUS_COVENANT,
  isPawFeltCovenant,
  isPawGlotusCovenant,
  resolvePawGenesisRegime,
} from '../src/params/pawMint.js';
import {
  PAW_TICKER,
  PAW_NAME,
  PAW_URL,
} from '../src/params/consensus.js';

describe('pawMint & consensus (GLotus model only)', () => {
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

  it('identifies GLotus covenant correctly', () => {
    expect(isPawFeltCovenant({ covenant: PAW_FELT_COVENANT })).toBe(true);
    expect(isPawGlotusCovenant({ covenant: PAW_GLOTUS_COVENANT })).toBe(true);
    expect(isPawFeltCovenant({ covenant: 'WlotusPowRemintMooreTip' })).toBe(false);
    expect(isPawFeltCovenant({ covenant: 'Unknown' })).toBe(false);
  });

  it('resolves regime to GLotus felt', () => {
    expect(resolvePawGenesisRegime({ REGIME: 'felt' })).toBe('glotus');
    expect(resolvePawGenesisRegime({})).toBe('glotus');
  });
});
