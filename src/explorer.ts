export const DEFAULT_DANA_EXPLORER_ORIGIN = 'https://danaverse.org';

export function danaExplorerOrigin(origin?: string | null): string {
  const raw = (origin ?? '').trim() || DEFAULT_DANA_EXPLORER_ORIGIN;
  return raw.replace(/\/$/, '');
}

export function explorerTx(
  txid: string,
  origin?: string | null,
  lang?: string | null,
): string {
  const path = `${danaExplorerOrigin(origin)}/offering/${txid.trim().toLowerCase()}`;
  return lang ? `${path}?lang=${lang}` : path;
}
