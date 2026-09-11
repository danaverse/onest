import { useEffect, useState } from 'react';
import type { Wallet } from 'ecash-wallet';
import { useLocale } from '../i18n/LocaleContext.js';
import { fetchPost, type FeedPost } from '../lib/socialApi.js';
import {
  createPaidVoteWithXec,
  fetchVoteFee,
  type VoteDirection,
  type VoteFee,
} from '../lib/paidVote.js';
import { BrandMark } from './BrandMark.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function VoteModal(props: {
  open: boolean;
  post: FeedPost;
  wallet: Wallet;
  onClose: () => void;
  onVoted?: (post: FeedPost) => void;
  onError?: (message: string) => void;
}) {
  const { t } = useLocale();
  const [fee, setFee] = useState<VoteFee | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setStatus(null);
    fetchVoteFee()
      .then(setFee)
      .catch(() => setFee(null));
  }, [props.open]);

  if (!props.open) return null;

  async function cast(direction: VoteDirection) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createPaidVoteWithXec({
        wallet: props.wallet,
        postId: props.post.id,
        direction,
        onProgress: setStatus,
      });

      setStatus(t('voteCounting'));
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
      } else {
        setError(message);
        props.onError?.(message);
      }
    } finally {
      setBusy(false);
      setStatus(null);
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
        {status && <div className="status-box">{status}</div>}

        <div className="vote-choices">
          <button
            type="button"
            className="btn-vote-choice up"
            disabled={busy}
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
            disabled={busy}
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

        {fee && (
          <p className="pow-hint">
            {t('voteFeeHint').replace('{xec}', fee.xec)}
          </p>
        )}
      </div>
    </div>
  );
}
