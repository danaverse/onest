import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import {
  fetchMemorialDetails,
  type IndexMemorialGroup,
} from '../lib/danaIndexApi.js';
import { fetchPetPosts, type FeedPost } from '../lib/socialApi.js';
import {
  parseAnimalProfileNote,
  profileBareNameFromNote,
} from '../../../../src/offering/animalProfileFields.js';
import { speciesEmoji } from '../lib/petUi.js';
import { PostCard } from './PostCard.js';

export function PetPage(props: {
  txid: string;
  onBack: () => void;
  onTribute: (rootTxid: string) => void;
  onShare: (rootTxid: string, petName: string) => void;
  onOpenPost: (postId: string) => void;
  onPetPostsChanged?: () => void;
}) {
  const { t } = useLocale();
  const [memorial, setMemorial] = useState<IndexMemorialGroup | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [tab, setTab] = useState<'posts' | 'tributes'>('posts');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setTab('posts');
    Promise.all([
      fetchMemorialDetails(props.txid),
      fetchPetPosts(props.txid, 30).catch(() => []),
    ])
      .then(([m, p]) => {
        if (cancelled) return;
        setMemorial(m);
        setPosts(p);
      })
      .catch(e => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load this page');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.txid]);

  const parsed = memorial ? parseAnimalProfileNote(memorial.originalNote) : null;
  const name =
    memorial ? profileBareNameFromNote(memorial.originalNote) || 'Animal Friend' : '';
  const species = parsed?.species || '';
  const childTributes = (memorial?.burns ?? []).filter(
    b => b.burnTxid.toLowerCase() !== memorial?.originalBurnTxid.toLowerCase(),
  );

  async function handleShareLink() {
    if (!memorial) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${memorial.originalBurnTxid}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pet-page">
      <button type="button" className="btn-back" onClick={props.onBack}>
        ← {t('backToHome')}
      </button>

      {loading && <div className="feed-loading"><span className="paw-spinner">🐾</span></div>}
      {err && <div className="error-box">{err}</div>}

      {memorial && (
        <>
          <header className="pet-page-header">
            <div className="pet-page-avatar">{speciesEmoji(species)}</div>
            <div className="pet-page-info">
              <h1>{name}</h1>
              <div className="detail-meta">
                {parsed?.breed && <span className="meta-tag">{parsed.breed}</span>}
                {(parsed?.birthDate || parsed?.passingDate) && (
                  <span className="meta-tag">
                    {parsed.birthDate && parsed.passingDate
                      ? `${parsed.birthDate} — ${parsed.passingDate}`
                      : parsed.birthDate
                        ? `Born ${parsed.birthDate}`
                        : `Passed ${parsed.passingDate}`}
                  </span>
                )}
                {parsed?.location && <span className="meta-tag">📍 {parsed.location}</span>}
                <span className="meta-tag paw-tag">
                  🐾 {memorial.totalBurns} tribute{memorial.totalBurns > 1 ? 's' : ''}
                </span>
              </div>
              {parsed?.note && <p className="pet-page-story">{parsed.note}</p>}
            </div>
          </header>

          <div className="pet-page-actions">
            <button
              type="button"
              className="btn-primary btn-action-tribute"
              onClick={() => props.onTribute(memorial.originalBurnTxid)}
            >
              🐾 {t('pawTribute')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => props.onShare(memorial.originalBurnTxid, name)}
            >
              📸 {t('shareMoment')}
            </button>
            <button type="button" className="btn-secondary" onClick={handleShareLink}>
              {copied ? t('linkCopied') : t('copyLink')}
            </button>
          </div>

          <div className="pet-tabs">
            <button
              type="button"
              className={tab === 'posts' ? 'pet-tab active' : 'pet-tab'}
              onClick={() => setTab('posts')}
            >
              {t('postsTab')} ({posts.length})
            </button>
            <button
              type="button"
              className={tab === 'tributes' ? 'pet-tab active' : 'pet-tab'}
              onClick={() => setTab('tributes')}
            >
              {t('tributesTab')} ({childTributes.length})
            </button>
          </div>

          {tab === 'posts' ? (
            posts.length > 0 ? (
              <div className="post-grid pet-post-grid">
                {posts.map(p => (
                  <PostCard
                    key={p.id}
                    post={p}
                    petName={name}
                    onOpen={() => props.onOpenPost(p.id)}
                    onOpenPet={() => props.onBack()}
                    onVoted={updated =>
                      setPosts(prev => prev.map(x => (x.id === updated.id ? updated : x)))
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="empty-hint">{t('noPetPosts')}</p>
            )
          ) : childTributes.length > 0 ? (
            <ul className="tribute-wall-list">
              {childTributes.map(b => (
                <li key={b.burnTxid} className="tribute-wall-item">
                  <span className="paw-bullet">🐾</span>
                  <div className="wall-item-content">
                    <p className="wall-item-note">
                      {parseAnimalProfileNote(b.note)?.note || b.note || 'A loving paw print'}
                    </p>
                    <div className="wall-item-meta">
                      <span className="wall-item-time">
                        {new Date(b.timeFirstSeen).toLocaleDateString()}
                      </span>
                      {b.burnAtoms && <span>{b.burnAtoms} PAW</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-tributes-yet">
              Be the first to leave a paw print tribute for {name}!
            </p>
          )}
        </>
      )}
    </div>
  );
}
