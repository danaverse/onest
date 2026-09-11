import { useLocale } from '../i18n/LocaleContext.js';
import { mediaUrl, type FeedPost } from '../lib/socialApi.js';
import { relativeTime, speciesEmoji } from '../lib/petUi.js';
import { VoteButton } from './VoteButton.js';

export function PostCard(props: {
  post: FeedPost;
  /** Overrides the server-enriched pet name (e.g. inside a pet page). */
  petName?: string;
  onOpen: () => void;
  onOpenPet?: () => void;
  onVoted?: (post: FeedPost) => void;
}) {
  const { t } = useLocale();
  const first = props.post.media[0];
  const name =
    props.petName ||
    props.post.pet?.name ||
    `Pet ${props.post.petRootTxid.slice(0, 8)}…`;
  const emoji = speciesEmoji(props.post.pet?.species);

  return (
    <article className="post-card">
      <header className="post-card-head">
        <button
          type="button"
          className="post-avatar"
          onClick={e => {
            e.stopPropagation();
            props.onOpenPet?.();
          }}
        >
          {emoji}
        </button>
        <div className="post-head-text">
          <button
            type="button"
            className="post-pet-name"
            onClick={e => {
              e.stopPropagation();
              props.onOpenPet?.();
            }}
          >
            {name}
          </button>
          <span className="post-time">{relativeTime(props.post.createdAt)}</span>
        </div>
      </header>

      {first && (
        <div className="post-card-media" onClick={props.onOpen}>
          <img src={mediaUrl(first.sha256)} alt="" loading="lazy" />
        </div>
      )}

      <p className="post-card-caption" onClick={props.onOpen}>
        {props.post.caption}
      </p>

      <footer className="post-card-footer">
        <VoteButton post={props.post} onVoted={props.onVoted} />
        <button type="button" className="btn-comment-link" onClick={props.onOpen}>
          💬 {t('comments')}
        </button>
        {props.post.status !== 'verified' && (
          <span className="post-card-pending">pending</span>
        )}
      </footer>
    </article>
  );
}
