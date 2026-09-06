/**
 * Load Onest mint-api env before any other mint-api module.
 *
 * Checks:
 *   1. Local .env
 *   2. /etc/onest/mint.env (Dedicated Onest configuration, NOT /etc/wlotus/mint.env)
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

export function loadMintApiEnv(opts?: {
  cwd?: string;
  mintEnvPath?: string;
}): ReturnType<typeof loadEnv> {
  const cwd = opts?.cwd ?? process.cwd();
  loadEnv({ path: resolve(cwd, '.env') });
  return loadEnv({
    path: opts?.mintEnvPath ?? process.env.ONEST_MINT_ENV ?? '/etc/onest/mint.env',
    override: true,
  });
}
