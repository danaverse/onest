/**
 * Onest PAW minting parameters.
 *
 * Single-tier model: all 100 atoms go to the miner / tip desk.
 * No temple tax or special catalog.
 */

export const PAW_MINER_ATOMS = 100n;
export { PAW_MINT_ATOMS } from './consensus.js';

/** PAW no-tax remint with GLotus style covenant (felt +1 bit) */
export const PAW_FELT_COVENANT = 'GlotusPowRemintMooreTip';
export const PAW_FELT_MODE = 'onest-moore-felt-bit';

/** PAW whole-byte remint */
export const PAW_MOORE_TIP_COVENANT = 'WlotusPowRemintMooreTip';
export const PAW_MOORE_TIP_MODE = 'onest-moore-tip-hard-bind';

export type PawGenesisRegime = 'felt' | 'moore-tip' | 'memo';

export function resolvePawGenesisRegime(
  env: Record<string, string | undefined> = process.env,
): PawGenesisRegime {
  const v = (env.COVENANT?.trim() || env.REGIME?.trim() || '').toLowerCase();
  if (v === 'moore-tip' || v === 'whole-byte') {
    return 'moore-tip';
  }
  if (v === 'memo') {
    return 'memo';
  }
  return 'felt';
}

export function isPawFeltCovenant(
  dep: { covenant?: string; mode?: string } | null | undefined,
): boolean {
  if (!dep) return false;
  return (
    dep.covenant === PAW_FELT_COVENANT ||
    dep.mode === PAW_FELT_MODE ||
    dep.mode === 'glotus-moore-felt-bit'
  );
}

export function isPawMooreTipCovenant(
  dep: { covenant?: string; mode?: string } | null | undefined,
): boolean {
  if (!dep) return false;
  return (
    dep.covenant === PAW_MOORE_TIP_COVENANT ||
    dep.mode === PAW_MOORE_TIP_MODE ||
    dep.mode === 'moore-tip-hard-bind'
  );
}
