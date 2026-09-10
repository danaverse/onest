import { useLocale } from '../i18n/LocaleContext.js';
import { mediaUrl, type FeedPost } from '../lib/socialApi.js';
import { VoteButton } from './VoteButton.js';

export function PostCard(props: {
  post: FeedPost;
  petName?: string;
  onOpen: () => void;
  onVoted?: (post: FeedPost) => void;
}) {
  const { t } = useLocale();
  const first = props.post.media[0];
  const name =
    props.petName || `Pet ${props.post.petRootTxid.slice(0, 8)}…`;

  return (
    <article className="post-card" onClick={props.onOpen}>
      {first && (
        <div className="post-card-media">
          <img src={mediaUrl(first.sha256)} alt="" loading="lazy" />
        </div>
      )}
      <div className="post-card-body">
        <div className="post-card-pet">{name}</div>
        <p className="post-card-caption">{props.post.caption}</p>
        <div className="post-card-footer">
          <VoteButton post={props.post} onVoted={props.onVoted} />
          <span className="post-card-date">
            {new Date(props.post.createdAt).toLocaleDateString()}
          </span>
          {props.post.status !== 'verified' && (
            <span className="post-card-pending">{t('pending')}</span>
          )}
        </div>
      </div>
    </article>
  );
}
