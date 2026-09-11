import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import { fetchPost, type FeedPost } from '../lib/socialApi.js';
import { runSponsoredOffer } from '../lib/offerRunner.js';
import { useWallet } from '../wallet/WalletContext.js';
import { BrandMark } from './BrandMark.js';
import { VoteModal } from './VoteModal.js';

export function VoteButton(props: {
  post: FeedPost;
  onVoted?: (post: FeedPost) => void;
  onError?: (message: string) => void;
}) {
  const { t } = useLocale();
  const { status, wallet } = useWallet();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const canPay = status === 'unlocked' && !!wallet;

  async function sponsoredVote() {
    setBusy(true);
    setProgress(t('votingStart'));
    try {
      await runSponsoredOffer({
        kind: 'vote',
        postHash: props.post.id,
        direction: 1,
        onProgress: setProgress,
      });
      setProgress(t('votingRefreshing'));
      const fresh = await fetchPost(props.post.id)
        .then(r => r.post)
        .catch(() => null);
      props.onVoted?.(
        fresh ?? { ...props.post, upvoteAtoms: props.post.upvoteAtoms + 1 },
      );
    } catch (err) {
      props.onError?.(err instanceof Error ? err.message : 'Vote failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (canPay && wallet) {
      setModalOpen(true);
      return;
    }
    void sponsoredVote();
  }

  return (
    <div className="vote-wrap">
      <button
        type="button"
        className="btn-vote"
        disabled={busy}
        onClick={handleClick}
        aria-label={t('voteUp')}
      >
        <BrandMark width={14} height={14} className="vote-paw" />
        <span className="vote-count">{props.post.upvoteAtoms}</span>
      </button>
      {progress && <span className="vote-progress">{progress}</span>}
      {canPay && wallet && (
        <VoteModal
          open={modalOpen}
          post={props.post}
          wallet={wallet}
          onClose={() => setModalOpen(false)}
          onVoted={props.onVoted}
          onError={props.onError}
        />
      )}
    </div>
  );
}
