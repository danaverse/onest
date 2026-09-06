/**
 * Per-key daily and sliding-window counters for rate limiting.
 */

export function utcDay(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

export interface DailyCounter {
  remaining(key: string): number;
  consume(key: string): void;
}

export function createDailyCounter(
  maxPerDay: number,
  message: (max: number) => string = (max) => `Daily limit reached (${max} per day).`,
  now: () => number = Date.now,
): DailyCounter {
  const counts = new Map<string, Map<number, number>>();

  function remaining(key: string): number {
    const day = utcDay(now());
    const used = counts.get(key)?.get(day) ?? 0;
    return Math.max(0, maxPerDay - used);
  }

  function consume(key: string): void {
    const day = utcDay(now());
    let byDay = counts.get(key);
    if (!byDay) {
      byDay = new Map();
      counts.set(key, byDay);
    }
    const used = byDay.get(day) ?? 0;
    if (used >= maxPerDay) {
      throw new Error(message(maxPerDay));
    }
    byDay.set(day, used + 1);
  }

  return { remaining, consume };
}

export interface RollingWindowCounter {
  used(key: string): number;
  consume(key: string): void;
}

export function createRollingWindowCounter(
  max: number,
  windowMs: number,
  message: (max: number) => string = (n) =>
    `Too many challenges from this network (${n} per minute). Try again shortly.`,
  now: () => number = Date.now,
): RollingWindowCounter {
  const hits = new Map<string, number[]>();

  function prune(key: string, t: number): number[] {
    const cutoff = t - windowMs;
    const list = hits.get(key);
    if (!list) return [];
    const kept = list.filter(ts => ts > cutoff);
    if (kept.length === 0) {
      hits.delete(key);
      return [];
    }
    hits.set(key, kept);
    return kept;
  }

  function used(key: string): number {
    return prune(key, now()).length;
  }

  function consume(key: string): void {
    const t = now();
    const kept = prune(key, t);
    if (kept.length >= max) {
      throw new Error(message(max));
    }
    kept.push(t);
    hits.set(key, kept);
  }

  return { used, consume };
}

export function normalizeClientIp(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const ip = raw.trim();
  if (ip.includes(':')) {
    // IPv6 /64 prefix
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':');
  }
  return ip;
}
