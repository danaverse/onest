import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import {
  fetchPost,
  mediaUrl,
  type FeedPost,
} from '../lib/socialApi.js';
import { runSponsoredOffer } from '../lib/offerRunner.js';

export function VoteButton(props: {
  post: FeedPost;
  onVoted?: (post: FeedPost) => void;
  onError?: (message: string) => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function vote(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
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

  return (
    <div className="vote-wrap">
      <button
        type="button"
        className="btn-vote"
        disabled={busy}
        onClick={vote}
        aria-label={t('voteUp')}
      >
        <span className="vote-arrow">▲</span>
        <span className="vote-count">{props.post.upvoteAtoms}</span>
      </button>
      {progress && <span className="vote-progress">{progress}</span>}
    </div>
  );
}
