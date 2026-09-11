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
  wallet: Wallet;
  onClose: () => void;
  onVoted?: (post: FeedPost) => void;
  onError?: (message: string) => void;
}) {
  const { t } = useLocale();
  const [fee, setFee] = useState<VoteFee | null>(null);
  const [method, setMethod] = useState<VoteMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setStatus(null);
    setMethod(null);
    let cancelled = false;
    Promise.all([
      fetchVoteFee().catch(() => null),
      fetchWalletBalances(props.wallet).catch(() => null),
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
  }, [props.open, props.wallet]);

  if (!props.open) return null;

  const hint =
    method === 'paw'
      ? t('votePawHint')
      : method === 'xec'
        ? fee
          ? t('voteFeeHint').replace('{xec}', fee.xec)
          : null
        : method === 'pow'
          ? t('powHint')
          : null;

  async function cast(direction: VoteDirection) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const balances = await fetchWalletBalances(props.wallet).catch(
        () => null,
      );
      const useMethod = balances
        ? chooseMethod(balances, fee ? BigInt(fee.xecSats) : null)
        : 'pow';
      setMethod(useMethod);

      if (useMethod === 'paw') {
        await createVoteWithPaw({
          wallet: props.wallet,
          postId: props.post.id,
          direction,
          onProgress: setStatus,
        });
      } else if (useMethod === 'xec') {
        await createPaidVoteWithXec({
          wallet: props.wallet,
          postId: props.post.id,
          direction,
          onProgress: setStatus,
        });
      } else {
        await runSponsoredOffer({
          kind: 'vote',
          postHash: props.post.id,
          direction,
          onProgress: setStatus,
        });
      }

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
      } else if (message === 'VOTE_NEED_PAW') {
        setError(t('voteNeedPaw'));
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

        {hint && <p className="pow-hint">{hint}</p>}
      </div>
    </div>
  );
}
