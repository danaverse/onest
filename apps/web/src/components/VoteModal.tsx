import { useEffect, useState } from 'react';
import type { Wallet } from 'ecash-wallet';
import { useLocale } from '../i18n/LocaleContext.js';
import { fetchPost, type FeedPost } from '../lib/socialApi.js';
import {
  createPaidVoteWithXec,
  createVoteWithPaw,
  fetchVoteFee,
  MIN_VOTE_PAW_XEC_SATS,
  MIN_VOTE_XEC_SATS,
  type VoteDirection,
  type VoteFee,
} from '../lib/paidVote.js';
import {
  fetchWalletBalances,
  type WalletBalances,
} from '../lib/userWallet.js';
import { runSponsoredOffer } from '../lib/offerRunner.js';
import { useWallet } from '../wallet/WalletContext.js';
import { BrandMark } from './BrandMark.js';

type VoteMethod = 'paw' | 'xec' | 'pow';

/** PAW first, then XEC, then sponsored PoW when the wallet is empty. */
function chooseMethod(
  balances: WalletBalances,
  feeSats: bigint | null,
): VoteMethod {
  if (balances.pawAtoms >= 1n && balances.xecSats >= MIN_VOTE_PAW_XEC_SATS) {
    return 'paw';
  }
  const xecNeed = feeSats !== null ? feeSats + 500n : MIN_VOTE_XEC_SATS;
  if (balances.xecSats >= xecNeed) return 'xec';
  return 'pow';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function VoteModal(props: {
  open: boolean;
  post: FeedPost;
  onClose: () => void;
  onVoted?: (post: FeedPost) => void;
  onError?: (message: string) => void;
}) {
  const { t } = useLocale();
  const { status, wallet, unlock, pinLength } = useWallet();
  const [fee, setFee] = useState<VoteFee | null>(null);
  const [stage, setStage] = useState<'choose' | 'confirm'>('choose');
  const [direction, setDirection] = useState<VoteDirection | null>(null);
  const [method, setMethod] = useState<VoteMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const locked = status === 'locked';

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setStatusMsg(null);
    setStage('choose');
    setDirection(null);
    setMethod(null);
    setPin('');
    fetchVoteFee()
      .then(setFee)
      .catch(() => setFee(null));
  }, [props.open]);

  if (!props.open) return null;

  function hintFor(): string | null {
    if (locked) return t('voteLockedHint');
    if (method === 'paw') return t('votePawHint');
    if (method === 'xec') {
      return fee ? t('voteFeeHint').replace('{xec}', fee.xec) : null;
    }
    if (method === 'pow') return t('powHint');
    return null;
  }

  function mapError(err: unknown) {
    const message = err instanceof Error ? err.message : 'Vote failed';
    if (message === 'VOTE_NEED_XEC') {
      setError(t('voteNeedXec'));
    } else if (message === 'VOTE_NEED_PAW') {
      setError(t('voteNeedPaw'));
    } else {
      setError(message);
      props.onError?.(message);
    }
  }

  async function resolveMethod(voter: Wallet): Promise<VoteMethod> {
    const balances = await fetchWalletBalances(voter).catch(() => null);
    const resolved = balances
      ? chooseMethod(balances, fee ? BigInt(fee.xecSats) : null)
      : 'pow';
    setMethod(resolved);
    return resolved;
  }

  async function pollAndClose(dir: VoteDirection) {
    setStatusMsg(t('voteCounting'));
    const before = dir === 1 ? props.post.upvoteAtoms : props.post.downvoteAtoms;
    let fresh: FeedPost | null = null;
    for (let i = 0; i < 6; i++) {
      await sleep(1_500);
      fresh = await fetchPost(props.post.id)
        .then(r => r.post)
        .catch(() => null);
      const now = fresh
        ? dir === 1
          ? fresh.upvoteAtoms
          : fresh.downvoteAtoms
        : null;
      if (now !== null && now > before) break;
    }
    props.onVoted?.(
      fresh ??
        (dir === 1
          ? { ...props.post, upvoteAtoms: props.post.upvoteAtoms + 1 }
          : { ...props.post, downvoteAtoms: props.post.downvoteAtoms + 1 }),
    );
    props.onClose();
  }

  async function perform(
    voter: Wallet,
    dir: VoteDirection,
    paidMethod: 'paw' | 'xec',
  ) {
    setBusy(true);
    setError(null);
    try {
      if (paidMethod === 'paw') {
        await createVoteWithPaw({
          wallet: voter,
          postId: props.post.id,
          direction: dir,
          onProgress: setStatusMsg,
        });
      } else {
        await createPaidVoteWithXec({
          wallet: voter,
          postId: props.post.id,
          direction: dir,
          onProgress: setStatusMsg,
        });
      }
      await pollAndClose(dir);
    } catch (err) {
      mapError(err);
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  }

  async function runPow() {
    if (direction == null) return;
    setBusy(true);
    setError(null);
    try {
      await runSponsoredOffer({
        kind: 'vote',
        postHash: props.post.id,
        direction,
        onProgress: setStatusMsg,
      });
      await pollAndClose(direction);
    } catch (err) {
      mapError(err);
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  }

  function select(dir: VoteDirection) {
    if (busy || unlocking) return;
    setDirection(dir);
    setStage('confirm');
    setError(null);
    setMethod(null);
    if (status === 'unlocked' && wallet) void resolveMethod(wallet);
  }

  async function submitUnlocked() {
    if (direction == null || !wallet) return;
    const resolved = method ?? (await resolveMethod(wallet));
    if (resolved === 'pow') {
      await runPow();
      return;
    }
    await perform(wallet, direction, resolved);
  }

  async function unlockNow(value: string): Promise<Wallet | null> {
    if (value.length < 4) return null;
    setUnlocking(true);
    setError(null);
    try {
      const unlocked = await unlock(value);
      setPin('');
      return unlocked;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wrong PIN');
      return null;
    } finally {
      setUnlocking(false);
    }
  }

  /* PIN matched: burn automatically (paw/xec). If the wallet is empty, wait
     for the explicit PoW button tap. */
  async function onPinComplete(value: string) {
    const voter = await unlockNow(value);
    if (!voter || direction == null) return;
    const resolved = await resolveMethod(voter);
    if (resolved === 'pow') return;
    await perform(voter, direction, resolved);
  }

  const choice = (dir: VoteDirection, label: string, arrow: string) => (
    <button
      type="button"
      className={`btn-vote-choice ${dir === 1 ? 'up' : 'down'}${
        direction === dir ? ' selected' : ''
      }`}
      disabled={busy || unlocking}
      onClick={() => select(dir)}
    >
      <span className="vote-choice-arrow">{arrow}</span>
      <span className="vote-choice-label">{label}</span>
      <span className="vote-choice-amount">
        <BrandMark width={14} height={14} />
        1 PAW
      </span>
    </button>
  );

  const hint = hintFor();

  return (
    <div
      className="modal-backdrop"
      onClick={e => {
        e.stopPropagation();
        props.onClose();
      }}
    >
      <div
        className="modal-content vote-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{t('voteTitle')}</h2>
          <button
            type="button"
            className="btn-close"
            onClick={props.onClose}
            aria-label={t('cancel')}
          >
            ×
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}
        {statusMsg && <div className="status-box">{statusMsg}</div>}

        <div className="vote-choices">
          {choice(1, t('voteUp'), '▲')}
          {choice(0, t('voteDown'), '▼')}
        </div>

        {stage === 'confirm' && (
          locked ? (
            <form
              className="vote-pin inline-unlock"
              onSubmit={e => {
                e.preventDefault();
                if (pin.length >= 4) void onPinComplete(pin);
              }}
            >
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={12}
                placeholder={t('pinHint')}
                value={pin}
                disabled={unlocking || busy}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 12);
                  setPin(v);
                  /* Windows Hello style: unlock + burn as soon as the PIN is in. */
                  if (pinLength && v.length === pinLength) void onPinComplete(v);
                }}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={unlocking || busy || pin.length < 4}
              >
                {unlocking ? t('loading') : t('voteSubmit')}
              </button>
            </form>
          ) : (
            <div className="vote-actions">
              <button
                type="button"
                className="btn-primary vote-submit"
                disabled={busy || unlocking || method === null}
                onClick={() =>
                  method === 'pow' ? void runPow() : void submitUnlocked()
                }
              >
                {method === 'pow' ? t('votePowButton') : t('voteSubmit')}
              </button>
            </div>
          )
        )}

        {hint && <p className="pow-hint">{hint}</p>}
      </div>
    </div>
  );
}
