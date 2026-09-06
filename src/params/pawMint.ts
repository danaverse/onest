/**
 * Onest PAW minting parameters.
 *
 * Single-tier model: all 108 atoms go to the miner / tip desk.
 * No temple tax or special catalog.
 * Follows the final canonical WLotusCovenant model (felt +1 bit).
 *
 * Difficulty and issuance aligned 1:1 with live production WLotus:
 * - WLotus Genesis Unix: 1788215242
 * - PAW_MINT_ATOMS = 108n (matching WLotus 108 atoms per remint)
 * - PAW_MINER_ATOMS = 108n
 */

import { PAW_MINT_ATOMS, WLOTUS_GENESIS_UNIX, POW_PAW_BASE_ZERO_BITS } from './consensus.js';

export const PAW_MINER_ATOMS = PAW_MINT_ATOMS;
export { PAW_MINT_ATOMS, WLOTUS_GENESIS_UNIX, POW_PAW_BASE_ZERO_BITS } from './consensus.js';

/** Canonical WLotusCovenant model (felt +1 bit) */
export const PAW_COVENANT = 'WLotusCovenant';
export const PAW_WLOTUS_COVENANT = 'WLotusCovenant';
export const PAW_FELT_COVENANT = 'WLotusCovenant';
export const PAW_GLOTUS_COVENANT = 'WLotusCovenant';
export const PAW_FELT_MODE = 'onest-moore-felt-bit';
export const PAW_GLOTUS_MODE = 'onest-moore-felt-bit';
export const PAW_WLOTUS_MODE = 'onest-moore-felt-bit';

export type PawGenesisRegime = 'wlotus' | 'glotus' | 'felt';

export function resolvePawGenesisRegime(
  _env: Record<string, string | undefined> = process.env,
): PawGenesisRegime {
  return 'wlotus';
}

export function isPawWLotusCovenant(
  dep: { covenant?: string; mode?: string } | null | undefined,
): boolean {
  if (!dep) return false;
  return (
    dep.covenant === PAW_WLOTUS_COVENANT ||
    dep.covenant === 'GlotusPowRemintMooreTip' ||
    dep.mode === PAW_FELT_MODE ||
    dep.mode === 'glotus-moore-felt-bit' ||
    dep.mode === 'wlotus-moore-felt-bit'
  );
}

export const isPawFeltCovenant = isPawWLotusCovenant;
export const isPawGlotusCovenant = isPawWLotusCovenant;
