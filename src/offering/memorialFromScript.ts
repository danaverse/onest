import { fromHex, parseEmppScript, Script } from 'ecash-lib';
import {
  parseMemorialPushdata,
  type MemorialFields,
} from './danaMemorial.js';

export function memorialFromEmppPushes(
  pushes: Uint8Array[],
): MemorialFields | null {
  for (const push of pushes) {
    if (push.length < 5) continue;
    if (push.length === 15 && push[4] === 4) continue;
    try {
      const parsed = parseMemorialPushdata(push);
      if (parsed.version === 1 || parsed.version === 2) return parsed;
    } catch {
      /* not a memorial push */
    }
  }
  return null;
}

export function memorialFromOutputScriptHex(
  outputScriptHex: string,
): MemorialFields | null {
  try {
    const script = new Script(fromHex(outputScriptHex));
    const pushes = parseEmppScript(script);
    if (!pushes?.length) return null;
    return memorialFromEmppPushes(pushes);
  } catch {
    return null;
  }
}
