import {
  DEFAULT_PROFILE_XEC_FEE,
  DEFAULT_VOTE_XEC_FEE,
  PROFILE_FEE_MAX_XEC,
  resolveProfileXecFee,
  resolveVoteXecFee,
  sumOutputsToScript,
  xecFromSats,
  xecToSats,
} from '../src/mint/profileFee.js';

describe('profile XEC fee', () => {
  it('defaults to 20 XEC and clamps overrides', () => {
    expect(resolveProfileXecFee(undefined)).toBe(20n);
    expect(DEFAULT_PROFILE_XEC_FEE).toBe(20n);
    expect(resolveProfileXecFee('30')).toBe(30n);
    expect(resolveProfileXecFee('0')).toBe(20n);
    expect(resolveProfileXecFee('999999')).toBe(PROFILE_FEE_MAX_XEC);
    expect(resolveProfileXecFee('nope')).toBe(20n);
  });

  it('defaults the vote fee to 6 XEC and clamps overrides', () => {
    expect(DEFAULT_VOTE_XEC_FEE).toBe(6n);
    expect(resolveVoteXecFee(undefined)).toBe(6n);
    expect(resolveVoteXecFee('')).toBe(6n);
    expect(resolveVoteXecFee('nope')).toBe(6n);
    expect(resolveVoteXecFee('5')).toBe(5n);
    expect(resolveVoteXecFee(8n)).toBe(8n);
    expect(resolveVoteXecFee('0')).toBe(6n);
    expect(resolveVoteXecFee('999999')).toBe(PROFILE_FEE_MAX_XEC);
    expect(xecToSats(resolveVoteXecFee('6'))).toBe(600n);
  });

  it('converts XEC <-> sats', () => {
    expect(xecToSats(20n)).toBe(2_000n);
    expect(xecFromSats(2_000n)).toBe('20');
    expect(xecFromSats(2_050n)).toBe('20.5');
  });

  it('sums only outputs paying the desk script', () => {
    const outputs = [
      { sats: 500n, outputScript: '76a914aa88ac' },
      { sats: 1_500n, outputScript: '76A914AA88AC' },
      { sats: 9_999n, outputScript: '6a04deadbeef' },
    ];
    expect(sumOutputsToScript(outputs, '76a914aa88ac')).toBe(2_000n);
    expect(sumOutputsToScript(outputs, '76a914bb88ac')).toBe(0n);
  });
});
