/**
 * Exchange payment memo: `ONEX<orderId>` pushed in an OP_RETURN.
 * The client includes it when paying XEC; the desk watcher matches orders.
 */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const EXCHANGE_MEMO_PREFIX = 'ONEX';
export const EXCHANGE_ORDER_ID_LEN = 32; // hex chars

export function isExchangeOrderId(raw: string | null | undefined): boolean {
  return /^[0-9a-f]{32}$/i.test(String(raw || '').trim());
}

export function exchangeMemo(orderId: string): string {
  const id = String(orderId || '').trim().toLowerCase();
  if (!isExchangeOrderId(id)) throw new Error('invalid order id');
  return `${EXCHANGE_MEMO_PREFIX}${id}`;
}

/** OP_RETURN script bytes: 0x6a <pushlen> <memo utf8>. */
export function memoOpReturnScriptBytes(memo: string): Uint8Array {
  const data = new TextEncoder().encode(memo);
  if (data.length > 75) throw new Error('memo too long');
  const out = new Uint8Array(2 + data.length);
  out[0] = 0x6a;
  out[1] = data.length;
  out.set(data, 2);
  return out;
}

/** Extract `ONEX<orderId>` from an output script hex, or null. */
export function decodeExchangeMemoFromScriptHex(
  outputScriptHex: string,
): string | null {
  try {
    const hex = outputScriptHex.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) return null;
    const bytes = hexToBytes(hex);
    if (bytes.length < 3 || bytes[0] !== 0x6a) return null;
    let o = 1;
    let len = bytes[o++]!;
    if (len >= 0x4c && len <= 0x4e) {
      const nBytes = len - 0x4b;
      if (bytes.length < o + nBytes) return null;
      len = 0;
      for (let i = 0; i < nBytes; i++) {
        len = (len << 8) | bytes[o++]!;
      }
    }
    if (len <= 0 || bytes.length < o + len) return null;
    const text = new TextDecoder().decode(bytes.slice(o, o + len));
    if (!text.startsWith(EXCHANGE_MEMO_PREFIX)) return null;
    const id = text.slice(EXCHANGE_MEMO_PREFIX.length).toLowerCase();
    return isExchangeOrderId(id) ? id : null;
  } catch {
    return null;
  }
}
