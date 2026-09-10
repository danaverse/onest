import { danaPushFromEmppPushes } from '../social/danaClassify.js';
import { danaPushFromOutputScriptHex } from '../social/danaFromScript.js';
import {
  parseMemorialPushdata,
  type MemorialFields,
} from './danaMemorial.js';

export function memorialFromEmppPushes(
  pushes: Uint8Array[],
): MemorialFields | null {
  const classified = danaPushFromEmppPushes(pushes);
  return classified?.kind === 'memorial' ? classified.memorial : null;
}

export function memorialFromOutputScriptHex(
  outputScriptHex: string,
): MemorialFields | null {
  const classified = danaPushFromOutputScriptHex(outputScriptHex);
  return classified?.kind === 'memorial' ? classified.memorial : null;
}

export { parseMemorialPushdata };
