/**
 * Token atoms burned in a DANA memorial (one paw-print tribute may burn 1 or more).
 */
export function parseBurnAtoms(
  raw: string | number | bigint | null | undefined,
): number {
  if (typeof raw === 'bigint') return raw > 0n ? Number(raw) : 1;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const n = BigInt(raw.trim());
      if (n > 0n) return Number(n);
    } catch {
      /* fall through */
    }
  }
  return 1;
}

export function sumPawAtoms(
  burns: Array<{ burnAtoms?: string | number | bigint | null }>,
  fallbackCount = 0,
): number {
  if (!burns.length) return Math.max(0, fallbackCount);
  return burns.reduce((sum, b) => sum + parseBurnAtoms(b.burnAtoms), 0);
}

export function groupPawAtoms(g: {
  totalPaw?: number;
  totalBurns?: number;
  burns?: Array<{ burnAtoms?: string | number | bigint | null }>;
}): number {
  if (typeof g.totalPaw === 'number' && g.totalPaw > 0) return g.totalPaw;
  return sumPawAtoms(g.burns ?? [], g.totalBurns ?? 0);
}

export function burnAtomsFromTokenEntries(
  entries: Array<{
    tokenId?: string;
    actualBurnAtoms?: bigint | string | number;
    intentionalBurnAtoms?: bigint | string | number;
  }>,
  tokenId: string,
): string {
  const want = tokenId.toLowerCase();
  let n = 0n;
  for (const e of entries) {
    if ((e.tokenId || '').toLowerCase() !== want) continue;
    const actual = BigInt(e.actualBurnAtoms ?? 0);
    const intent = BigInt(e.intentionalBurnAtoms ?? 0);
    if (actual > n) n = actual;
    if (intent > n) n = intent;
  }
  return (n > 0n ? n : 1n).toString();
}
