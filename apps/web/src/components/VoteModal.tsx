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
  const {
    status,
    wallet,
    unlock,
    pinLength,
  } = useWallet();
  const [fee, setFee] = useState<VoteFee | null>(null);
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
    setMethod(null);
    setPin('');
    let cancelled = false;
    Promise.all([
      fetchVoteFee().catch(() => null),
      status === 'unlocked' && wallet
        ? fetchWalletBalances(wallet).catch(() => null)
        : Promise.resolve(null),
    ]).then(([feeRes, balances]) => {
      if (cancelled) return;
      setFee(feeRes);
      if (balances) {
        setMethod(
          chooseMethod(balances, feeRes ? BigInt(feeRes.xecSats) : null),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.open, status, wallet]);

  if (!props.open) return null;

  const hint = locked
    ? t('voteLockedHint')
    : method === 'paw'
      ? t('votePawHint')
      : method === 'xec'
        ? fee
          ? t('voteFeeHint').replace('{xec}', fee.xec)
          : null
        : method === 'pow'
          ? t('powHint')
          : null;

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

  async function cast(direction: VoteDirection) {
    if (busy || unlocking) return;
    setBusy(true);
    setError(null);
    try {
      let voter = status === 'unlocked' ? wallet : null;
      if (!voter) {
        if (pin.length < 4) {
          setError(t('votePinNeeded'));
          return;
        }
        voter = await unlockNow(pin);
        if (!voter) return;
      }

      const balances = await fetchWalletBalances(voter).catch(() => null);
      const useMethod = balances
        ? chooseMethod(balances, fee ? BigInt(fee.xecSats) : null)
        : 'pow';
      setMethod(useMethod);

      if (useMethod === 'paw') {
        await createVoteWithPaw({
          wallet: voter,
          postId: props.post.id,
          direction,
          onProgress: setStatusMsg,
        });
      } else if (useMethod === 'xec') {
        await createPaidVoteWithXec({
          wallet: voter,
          postId: props.post.id,
          direction,
          onProgress: setStatusMsg,
        });
      } else {
        await runSponsoredOffer({
          kind: 'vote',
          postHash: props.post.id,
          direction,
          onProgress: setStatusMsg,
        });
      }

      setStatusMsg(t('voteCounting'));
      const before =
        direction === 1 ? props.post.upvoteAtoms : props.post.downvoteAtoms;
      let fresh: FeedPost | null = null;
      for (let i = 0; i < 6; i++) {
        await sleep(1_500);
        fresh = await fetchPost(props.post.id)
          .then(r => r.post)
          .catch(() => null);
        const now = fresh
          ? direction === 1
            ? fresh.upvoteAtoms
            : fresh.downvoteAtoms
          : null;
        if (now !== null && now > before) break;
      }

      props.onVoted?.(
        fresh ??
          (direction === 1
            ? { ...props.post, upvoteAtoms: props.post.upvoteAtoms + 1 }
            : { ...props.post, downvoteAtoms: props.post.downvoteAtoms + 1 }),
      );
      props.onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vote failed';
      if (message === 'VOTE_NEED_XEC') {
        setError(t('voteNeedXec'));
      } else if (message === 'VOTE_NEED_PAW') {
        setError(t('voteNeedPaw'));
      } else {
        setError(message);
        props.onError?.(message);
      }
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  }

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

        {locked && (
          <div className="vote-pin">
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
                /* Windows Hello style: unlock as soon as the full PIN is in. */
                if (pinLength && v.length === pinLength) void unlockNow(v);
              }}
            />
          </div>
        )}

        <div className="vote-choices">
          <button
            type="button"
            className="btn-vote-choice up"
            disabled={busy || unlocking}
            onClick={() => cast(1)}
          >
            <span className="vote-choice-arrow">▲</span>
            <span className="vote-choice-label">{t('voteUp')}</span>
            <span className="vote-choice-amount">
              <BrandMark width={14} height={14} />
              1 PAW
            </span>
          </button>
          <button
            type="button"
            className="btn-vote-choice down"
            disabled={busy || unlocking}
            onClick={() => cast(0)}
          >
            <span className="vote-choice-arrow">▼</span>
            <span className="vote-choice-label">{t('voteDown')}</span>
            <span className="vote-choice-amount">
              <BrandMark width={14} height={14} />
              1 PAW
            </span>
          </button>
        </div>

        {hint && <p className="pow-hint">{hint}</p>}
      </div>
    </div>
  );
}
