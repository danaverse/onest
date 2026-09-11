/**
 * Client-side signing helpers for the user-paid remint (browser-safe).
 * The desk prepares the preimages; the wallet signs them locally.
 */
import { ALL_BIP143, Ecc, flagSignature, fromHex, sha256d } from 'ecash-lib';

/** 65-byte flagged BIP143 schnorr signature over sha256d(preimage). */
export function signBip143Preimage(
  preimageHex: string,
  sk: Uint8Array,
): Uint8Array {
  const preimage = fromHex(preimageHex.trim().toLowerCase());
  const raw = new Ecc().schnorrSign(sk, sha256d(preimage));
  return flagSignature(raw, ALL_BIP143);
}

/** Raw 64-byte data signature (drop the SIGHASH flag byte). */
export function ds64FromSig(sig65: Uint8Array): Uint8Array {
  if (sig65.length !== 65) throw new Error('sig must be 65 bytes');
  return sig65.slice(0, 64);
}

/** scriptSig for a P2PKH input: `<sig65> <pubkey33>`. */
export function p2pkhScriptSig(sig65: Uint8Array, pk: Uint8Array): Uint8Array {
  if (sig65.length !== 65) throw new Error('sig must be 65 bytes');
  if (pk.length !== 33) throw new Error('pubkey must be 33 bytes');
  const out = new Uint8Array(1 + 65 + 1 + 33);
  out[0] = 65;
  out.set(sig65, 1);
  out[66] = 33;
  out.set(pk, 67);
  return out;
}
