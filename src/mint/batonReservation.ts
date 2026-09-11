/**
 * In-memory reservation of client-mint batons so concurrent users don't race
 * for the same one. Pure logic (no chronik), unit-testable.
 */
export interface BatonReservation {
  key: string;
  installId: string;
  reservedAt: number;
  expiresAt: number;
}

export const BATON_RESERVE_MS_DEFAULT = 10 * 60_000;

export class BatonReservations {
  private byKey = new Map<string, BatonReservation>();

  constructor(private readonly ttlMs = BATON_RESERVE_MS_DEFAULT) {}

  private prune(now: number): void {
    for (const [key, res] of this.byKey) {
      if (res.expiresAt <= now) this.byKey.delete(key);
    }
  }

  /** Reserve a baton key for an install; idempotent for the same install. */
  reserve(
    key: string,
    installId: string,
    now = Date.now(),
  ): { ok: true; reservation: BatonReservation } | { ok: false; retryAfterMs: number } {
    this.prune(now);
    const existing = this.byKey.get(key);
    if (existing) {
      if (existing.installId === installId) {
        return { ok: true, reservation: existing };
      }
      return { ok: false, retryAfterMs: Math.max(0, existing.expiresAt - now) };
    }
    const reservation: BatonReservation = {
      key,
      installId,
      reservedAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.byKey.set(key, reservation);
    return { ok: true, reservation };
  }

  release(key: string, installId: string): void {
    const existing = this.byKey.get(key);
    if (existing && existing.installId === installId) {
      this.byKey.delete(key);
    }
  }

  isReserved(key: string, now = Date.now()): boolean {
    this.prune(now);
    return this.byKey.has(key);
  }

  activeCount(now = Date.now()): number {
    this.prune(now);
    return this.byKey.size;
  }
}

export function batonKey(txid: string, outIdx: number): string {
  return `${txid.trim().toLowerCase()}:${outIdx}`;
}
