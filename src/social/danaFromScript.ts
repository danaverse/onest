/**
 * EMPP output script -> DANA push. Isolated here so the pure classifier
 * (danaClassify.ts) stays free of ecash-lib/wasm imports.
 */
import { fromHex, parseEmppScript, Script } from 'ecash-lib';
import { danaPushFromEmppPushes, type DanaPush } from './danaClassify.js';

export function danaPushFromOutputScriptHex(outputScriptHex: string): DanaPush | null {
  try {
    const script = new Script(fromHex(outputScriptHex));
    const pushes = parseEmppScript(script);
    if (!pushes?.length) return null;
    return danaPushFromEmppPushes(pushes);
  } catch {
    return null;
  }
}
