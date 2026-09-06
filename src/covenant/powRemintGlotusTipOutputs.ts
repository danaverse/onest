import { ALP_STANDARD, alpMint, emppScript, Script } from 'ecash-lib';

export function expectedGlotusMintOpReturnScript(
  tokenId: string,
  mintAtoms: bigint,
): Script {
  return emppScript([
    alpMint(tokenId, ALP_STANDARD, {
      atomsArray: [mintAtoms],
      numBatons: 1,
    }),
  ]);
}
