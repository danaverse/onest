/**
 * Signed binding message: proves the wallet address belongs to this device
 * install. Server verifies with ecash-lib verifyMsg(msg, signature, address).
 */
export const USER_BIND_VERSION = 'onest:bind:v1';

export function userBindMessage(installId: string): string {
  const id = String(installId || '').trim();
  if (!id) throw new Error('installId required');
  return `${USER_BIND_VERSION}:${id}`;
}
