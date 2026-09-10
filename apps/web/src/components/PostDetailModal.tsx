import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import {
  addComment,
  fetchPost,
  isOwnComment,
  isOwnPost,
  mediaUrl,
  removeComment,
  removePost,
  type FeedPost,
  type PostComment,
} from '../lib/socialApi.js';
import { VoteButton } from './VoteButton.js';

export function PostDetailModal(props: {
  open: boolean;
  postId: string | null;
  petName?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { t } = useLocale();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!props.open || !props.postId) return;
    setLoading(true);
    setErr(null);
    setDraft('');
    fetchPost(props.postId)
      .then(({ post: p, comments: c }) => {
        setPost(p);
        setComments(c);
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Could not load this moment'))
      .finally(() => setLoading(false));
  }, [props.open, props.postId]);

  if (!props.open) return null;

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!post || !draft.trim() || sending) return;
    setSending(true);
    try {
      const comment = await addComment(post.id, draft.trim());
      setComments(prev => [...prev, comment]);
      setDraft('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add comment');
    } finally {
      setSending(false);
    }
  }

  async function handleRemoveComment(commentId: string) {
    try {
      await removeComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove comment');
    }
  }

  async function handleRemovePost() {
    if (!post) return;
    try {
      await removePost(post.id);
      props.onChanged?.();
      props.onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove this moment');
    }
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-content post-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{props.petName || 'A loving moment'}</h2>
          <button type="button" className="btn-close" onClick={props.onClose}>
            &times;
          </button>
        </div>

        {loading && <div className="loading-state">{t('loading')}</div>}
        {err && <div className="error-box">{err}</div>}

        {post && (
          <div className="post-detail-body">
            <div className="post-detail-media">
              {post.media.map(m => (
                <img key={m.sha256} src={mediaUrl(m.sha256)} alt="" />
              ))}
            </div>
            <p className="post-detail-caption">{post.caption}</p>

            <div className="post-detail-actions">
              <VoteButton
                post={post}
                onVoted={updated => {
                  setPost(updated);
                  props.onChanged?.();
                }}
                onError={setErr}
              />
              <span className="post-card-date">
                {new Date(post.createdAt).toLocaleString()}
              </span>
              {isOwnPost(post) && (
                <button type="button" className="btn-tribute-link" onClick={handleRemovePost}>
                  {t('remove')}
                </button>
              )}
            </div>

            <div className="comments-section">
              <h3>{t('comments')} ({comments.length})</h3>
              {comments.length === 0 && <p className="no-tributes-yet">{t('noCommentsYet')}</p>}
              <ul className="comment-list">
                {comments.map(c => (
                  <li key={c.id} className="comment-item">
                    <p className="comment-body">{c.body}</p>
                    <div className="comment-meta">
                      <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                      {isOwnComment(c) && (
                        <button
                          type="button"
                          className="btn-tribute-link"
                          onClick={() => handleRemoveComment(c.id)}
                        >
                          {t('remove')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleComment} className="comment-form">
                <input
                  type="text"
                  value={draft}
                  maxLength={300}
                  disabled={sending}
                  placeholder={t('commentPlaceholder')}
                  onChange={e => setDraft(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={sending || !draft.trim()}>
                  {sending ? t('posting') : t('sendComment')}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
