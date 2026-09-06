import { ALP_STANDARD, alpMint, emppScript, Script } from 'ecash-lib';

export function expectedWLotusCovenantMintOpReturnScript(
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

export const expectedGlotusMintOpReturnScript = expectedWLotusCovenantMintOpReturnScript;
