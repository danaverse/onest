/**
 * Shared sponsored offer flow: challenge -> PoW -> submit (remint) ->
 * server-enforced soft wait countdown -> burn.
 *
 * Used by memorials, post stamps (v4) and votes (v3).
 */
import {
  BurnWaitError,
  completeOfferBurn,
  fetchChallenge,
  submitMinedOffer,
  type BurnKind,
  type OfferOk,
} from './offerApi.js';
import { mineInWorker } from './mineRunner.js';
import { setOfferingBlocksPwaReload } from './pwaReloadGate.js';

export interface SponsoredOfferInput {
  kind: BurnKind;
  note?: string;
  parentBurnTxid?: string;
  contentHash?: string;
  postHash?: string;
  direction?: 0 | 1;
  onProgress?: (message: string) => void;
}

export interface SponsoredOfferResult {
  kind: BurnKind;
  remintTxid: string;
  burnTxid: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

/** Tick a countdown until `untilMs`, reporting remaining seconds each second. */
async function waitWithCountdown(
  untilMs: number,
  onProgress: ((message: string) => void) | undefined,
  prefix: string,
): Promise<void> {
  for (;;) {
    const remaining = untilMs - Date.now();
    if (remaining <= 0) return;
    onProgress?.(`${prefix} ${Math.ceil(remaining / 1000)}s`);
    await sleep(Math.min(1000, remaining));
  }
}

/** A desk restart loses in-memory challenges; re-challenge and re-mine. */
const RETRYABLE_CHALLENGE = /invalid or expired challenge|tip_race_lost/i;

async function challengeMineAndSubmit(
  input: SponsoredOfferInput,
  onProgress?: (message: string) => void,
): Promise<OfferOk> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      onProgress?.('Requesting PoW challenge...');
      const challenge = await fetchChallenge({
        kind: input.kind,
        note: input.note,
        parentBurnTxid: input.parentBurnTxid,
        contentHash: input.contentHash,
        postHash: input.postHash,
        direction: input.direction,
      });

      onProgress?.(`Mining PoW (${challenge.bits} bits)...`);
      const mined = await mineInWorker({
        powPrefixHex: challenge.powPrefixHex,
        bits: challenge.bits,
        nonceLength: challenge.nonceLength,
        onProgress: p => {
          onProgress?.(
            `Mining PoW: ${p.attempts.toLocaleString()} attempts (${p.hashrateHps.toLocaleString()} H/s)`,
          );
        },
      });

      onProgress?.('Submitting mined offer to desk...');
      return await submitMinedOffer({
        challengeId: challenge.challengeId,
        nonceHex: mined.nonceHex,
        powMs: mined.elapsedMs,
        powAttempts: mined.attempts,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (attempt < 3 && RETRYABLE_CHALLENGE.test(message)) {
        onProgress?.('The desk reset the challenge — retrying...');
        await sleep(1_000);
        continue;
      }
      throw e;
    }
  }
}

export async function runSponsoredOffer(
  input: SponsoredOfferInput,
): Promise<SponsoredOfferResult> {
  const { onProgress } = input;
  setOfferingBlocksPwaReload(true);
  try {
    const submitted = await challengeMineAndSubmit(input, onProgress);

    if (!submitted.burnPending || !submitted.burnToken) {
      return {
        kind: input.kind,
        remintTxid: submitted.remintTxid,
        burnTxid: submitted.burnTxid || submitted.remintTxid,
      };
    }

    const burnToken = submitted.burnToken;
    const waitUntilMs = submitted.waitUntil ? Date.parse(submitted.waitUntil) : Date.now();
    const label =
      input.kind === 'post'
        ? 'Stamping this moment...'
        : input.kind === 'vote'
          ? 'Dedicating your vote...'
          : 'Dedicating on-chain paw-print burn...';
    await waitWithCountdown(waitUntilMs, onProgress, label);
    onProgress?.(label);

    let burnTxid = '';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const burned = await completeOfferBurn({
          remintTxid: submitted.remintTxid,
          burnToken,
        });
        burnTxid = burned.burnTxid;
        break;
      } catch (e) {
        if (e instanceof BurnWaitError && attempt < 3) {
          await waitWithCountdown(
            Date.now() + e.retryAfterMs,
            onProgress,
            label,
          );
          continue;
        }
        throw e;
      }
    }
    if (!burnTxid) throw new Error('Burn did not complete');

    return {
      kind: input.kind,
      remintTxid: submitted.remintTxid,
      burnTxid,
    };
  } finally {
    setOfferingBlocksPwaReload(false);
  }
}
