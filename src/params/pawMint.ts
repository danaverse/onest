/**
 * Onest PAW minting parameters.
 *
 * Single-tier model: all 100 atoms go to the miner / tip desk.
 * No temple tax or special catalog.
 * Exclusively supports the GLotus covenant model (felt +1 bit).
 */

export const PAW_MINER_ATOMS = 100n;
export { PAW_MINT_ATOMS } from './consensus.js';

/** PAW no-tax remint with GLotus covenant (felt +1 bit) */
export const PAW_FELT_COVENANT = 'GlotusPowRemintMooreTip';
export const PAW_GLOTUS_COVENANT = 'GlotusPowRemintMooreTip';
export const PAW_FELT_MODE = 'onest-moore-felt-bit';
export const PAW_GLOTUS_MODE = 'onest-moore-felt-bit';

export type PawGenesisRegime = 'glotus' | 'felt';

export function resolvePawGenesisRegime(
  _env: Record<string, string | undefined> = process.env,
): PawGenesisRegime {
  return 'glotus';
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

export const isPawGlotusCovenant = isPawFeltCovenant;
