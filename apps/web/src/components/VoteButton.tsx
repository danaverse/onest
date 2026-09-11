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
  const {
    status,
    wallet,
    unlock,
    pinLength,
    busy: walletBusy,
  } = useWallet();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pin, setPin] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockErr, setUnlockErr] = useState<string | null>(null);

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

  async function unlockNow(value: string) {
    if (unlocking || walletBusy || value.length < 4) return;
    setUnlocking(true);
    setUnlockErr(null);
    try {
      await unlock(value);
      setPin('');
      setShowUnlock(false);
      setModalOpen(true);
    } catch (e) {
      setUnlockErr(e instanceof Error ? e.message : 'Wrong PIN');
    } finally {
      setUnlocking(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    await unlockNow(pin);
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (status === 'unlocked' && wallet) {
      setModalOpen(true);
      return;
    }
    if (status === 'locked') {
      /* Never spend PoW for an account holder — unlock, then vote. */
      setShowUnlock(true);
      setUnlockErr(null);
      return;
    }
    if (status === 'none') void sponsoredVote();
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
      {showUnlock && status === 'locked' && (
        <form
          className="inline-unlock"
          onClick={e => e.stopPropagation()}
          onSubmit={handleUnlock}
        >
          <span className="vote-progress">{t('voteLockedHint')}</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={12}
            placeholder={t('pinHint')}
            value={pin}
            disabled={unlocking}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 12);
              setPin(v);
              if (pinLength && v.length === pinLength) void unlockNow(v);
            }}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={unlocking || pin.length < 4}
          >
            {unlocking ? t('loading') : t('unlockWallet')}
          </button>
          {unlockErr && <div className="error-box">{unlockErr}</div>}
        </form>
      )}
      {status === 'unlocked' && wallet && (
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
