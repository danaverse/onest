export function speciesEmoji(species: string | null | undefined): string {
  switch ((species || '').toLowerCase()) {
    case 'dog':
      return '🐕';
    case 'cat':
      return '🐈';
    case 'bird':
      return '🦜';
    case 'rabbit':
      return '🐇';
    case 'horse':
      return '🐴';
    default:
      return '🐾';
  }
}

/** 1 XEC = 100 sats; compact display with at most 2 decimals. */
export function formatXecSats(sats: bigint | number | null | undefined): string {
  if (sats == null) return '—';
  return (Number(sats) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(ms).toLocaleDateString();
}
