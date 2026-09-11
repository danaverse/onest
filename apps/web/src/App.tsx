import { useState, useEffect, useMemo } from 'react';
import { useLocale } from './i18n/LocaleContext.js';
import { BrandMark } from './components/BrandMark.js';
import { Header } from './components/Header.js';
import { AccountChip } from './components/AccountChip.js';
import { UserWalletModal } from './components/UserWalletModal.js';
import { AnimalProfileModal } from './components/AnimalProfileModal.js';
import { PostComposerModal, type PetOption } from './components/PostComposerModal.js';
import { PostCard } from './components/PostCard.js';
import { PostDetailModal } from './components/PostDetailModal.js';
import { PetPage } from './components/PetPage.js';
import { MyPets } from './components/MyPets.js';
import { TabBar, type AppTab } from './components/TabBar.js';
import {
  fetchRecentBurns,
  fetchTrendingProfiles,
  searchProfiles,
  type IndexBurn,
  type IndexMemorialGroup,
} from './lib/danaIndexApi.js';
import {
  fetchFeed,
  type FeedPage,
  type FeedPost,
} from './lib/socialApi.js';
import { profileBareNameFromNote } from '../../../src/offering/animalProfileFields.js';
import { speciesEmoji } from './lib/petUi.js';

const FEED_PAGE_SIZE = 12;

export default function App() {
  const { t } = useLocale();
  const [route, setRoute] = useState<{ name: 'home' } | { name: 'pet'; txid: string }>({
    name: 'home',
  });
  const [tab, setTab] = useState<AppTab>('home');
  const [recent, setRecent] = useState<IndexBurn[]>([]);
  const [trending, setTrending] = useState<IndexMemorialGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IndexMemorialGroup[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsNext, setPostsNext] = useState<FeedPage['next']>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [composer, setComposer] = useState<{ open: boolean; petTxid?: string }>({
    open: false,
  });
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [profileModal, setProfileModal] = useState<{
    open: boolean;
    parentBurnTxid?: string;
  }>({ open: false });
  const [petsRefresh, setPetsRefresh] = useState(0);

  useEffect(() => {
    loadFeed();
    loadPosts();
    checkUrlPath();
    const handlePopState = () => checkUrlPath();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function checkUrlPath() {
    const path = window.location.pathname.replace(/^\//, '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(path)) {
      setRoute({ name: 'pet', txid: path });
    } else {
      setRoute({ name: 'home' });
    }
  }

  function openPet(txid: string) {
    window.history.pushState(null, '', `/${txid}`);
    setRoute({ name: 'pet', txid: txid.toLowerCase() });
    window.scrollTo({ top: 0 });
  }

  function goHome() {
    window.history.pushState(null, '', '/');
    setRoute({ name: 'home' });
  }

  async function loadFeed() {
    try {
      setLoading(true);
      const [r, tr] = await Promise.all([
        fetchRecentBurns(20).catch(() => []),
        fetchTrendingProfiles(12).catch(() => []),
      ]);
      setRecent(r);
      setTrending(tr);
    } finally {
      setLoading(false);
    }
  }

  async function loadPosts(cursor?: FeedPage['next']) {
    try {
      setFeedLoading(true);
      const page = await fetchFeed(FEED_PAGE_SIZE, cursor);
      setPosts(prev => (cursor ? [...prev, ...page.posts] : page.posts));
      setPostsNext(page.next);
    } catch {
      if (!cursor) setPosts([]);
    } finally {
      setFeedLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    if (route.name !== 'home') {
      goHome();
    }
    const results = await searchProfiles(searchQuery.trim()).catch(() => []);
    setSearchResults(results);
  }

  function handleVoted(updated: FeedPost) {
    setPosts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
  }

  function openComposer(petTxid?: string) {
    setComposer({ open: true, petTxid });
  }

  const pets: PetOption[] = useMemo(() => {
    const byRoot = new Map<string, string>();
    for (const b of recent) {
      const root = (b.originalBurnTxid || b.burnTxid).toLowerCase();
      byRoot.set(root, profileBareNameFromNote(b.note) || `Pet ${root.slice(0, 8)}…`);
    }
    for (const g of trending) {
      const root = g.originalBurnTxid.toLowerCase();
      byRoot.set(
        root,
        profileBareNameFromNote(g.originalNote) || byRoot.get(root) || `Pet ${root.slice(0, 8)}…`,
      );
    }
    return [...byRoot.entries()].map(([txid, name]) => ({ txid, name }));
  }, [recent, trending]);

  const petNameByRoot = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pets) map.set(p.txid.toLowerCase(), p.name);
    return map;
  }, [pets]);

  const detailPost = detailPostId ? posts.find(p => p.id === detailPostId) : undefined;

  return (
    <div className="onest-app">
      <header className="onest-header">
        <div className="header-brand clickable-brand" onClick={goHome}>
          <BrandMark width={36} height={36} className="brand-logo" />
          <div>
            <h1 className="brand-title">{t('brand')}</h1>
            <p className="brand-tagline">{t('tagline')}</p>
          </div>
        </div>
        <div className="header-right">
          <button
            type="button"
            className={`btn-header-search${searchOpen ? ' is-active' : ''}`}
            aria-label={t('search')}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(v => !v)}
          >
            🔍
          </button>
          <AccountChip onOpen={() => setWalletOpen(true)} />
          <Header />
        </div>
      </header>

      {searchOpen && (
        <form onSubmit={handleSearch} className="search-form header-search">
          <input
            type="search"
            autoFocus
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) setSearchResults(null);
            }}
          />
          <button type="submit" className="btn-search">
            {t('search')}
          </button>
        </form>
      )}

      <main className="onest-main">
        {route.name === 'pet' ? (
          <PetPage
            txid={route.txid}
            onBack={goHome}
            onTribute={rootTxid => setProfileModal({ open: true, parentBurnTxid: rootTxid })}
            onShare={rootTxid => openComposer(rootTxid)}
            onOpenPost={id => setDetailPostId(id)}
          />
        ) : tab === 'mypets' ? (
          <MyPets
            refreshKey={petsRefresh}
            onOpenPet={openPet}
            onCreatePet={() => setProfileModal({ open: true })}
            onRequestWallet={() => setWalletOpen(true)}
          />
        ) : (
          <>
            <section className="composer-card" onClick={() => openComposer()}>
              <span className="composer-avatar">🐾</span>
              <span className="composer-placeholder">{t('shareMomentPlaceholder')}</span>
              <span className="composer-photo">📷</span>
            </section>

            {searchResults ? (
              <section className="profiles-section">
                <h2>{t('searchResults')}</h2>
                <div className="profile-grid">
                  {searchResults.map(g => (
                    <div
                      key={g.originalBurnTxid}
                      className="profile-card clickable"
                      onClick={() => openPet(g.originalBurnTxid)}
                    >
                      <div className="card-top">
                        <span className="page-chip-avatar">{speciesEmoji('')}</span>
                        <h3>{profileBareNameFromNote(g.originalNote) || 'Animal Friend'}</h3>
                      </div>
                      <p className="tribute-count">
                        🐾 {g.totalBurns} tribute{g.totalBurns > 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                  {searchResults.length === 0 && (
                    <p className="empty-hint">{t('noProfilesFound')}</p>
                  )}
                </div>
              </section>
            ) : (
              <>
                <section className="timeline-section">
                  <div className="feed-head">
                    <h2>{t('moments')}</h2>
                  </div>

                  {feedLoading && posts.length === 0 && (
                    <div className="feed-loading">
                      <span className="paw-spinner">🐾</span>
                    </div>
                  )}

                  {!feedLoading && posts.length === 0 && (
                    <div className="empty-welcome-card">
                      <p className="empty-hint">{t('noMomentsYet')}</p>
                    </div>
                  )}

                  <div className="timeline-list">
                    {posts.map(p => (
                      <PostCard
                        key={p.id}
                        post={p}
                        onOpen={() => setDetailPostId(p.id)}
                        onOpenPet={() => openPet(p.petRootTxid)}
                        onVoted={handleVoted}
                      />
                    ))}
                  </div>

                  {postsNext && (
                    <div className="feed-more">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={feedLoading}
                        onClick={() => loadPosts(postsNext)}
                      >
                        {t('loadMore')}
                      </button>
                    </div>
                  )}
                </section>

                {recent.length > 0 && (
                  <section className="recent-section">
                    <h2>{t('recentTributes')}</h2>
                    <ul className="tribute-list">
                      {recent.map(b => (
                        <li key={b.burnTxid} className="tribute-item">
                          <span className="paw-bullet">🐾</span>
                          <div className="tribute-details">
                            <span
                              className="tribute-note clickable-text"
                              onClick={() => openPet(b.originalBurnTxid || b.burnTxid)}
                            >
                              {profileBareNameFromNote(b.note) || 'A loving paw print tribute'}
                            </span>
                            <a
                              href={`https://danaverse.org/offering/${b.burnTxid}`}
                              target="_blank"
                              rel="noreferrer"
                              className="tx-link"
                            >
                              {b.burnTxid.slice(0, 8)}...
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {loading && (
                  <div className="feed-loading">
                    <span className="paw-spinner">🐾</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {!profileModal.open && !composer.open && !detailPostId && !walletOpen && (
        <TabBar tab={tab} onTab={setTab} />
      )}

      <AnimalProfileModal
        open={profileModal.open}
        parentBurnTxid={profileModal.parentBurnTxid}
        onClose={() => setProfileModal({ open: false })}
        onRequestWallet={() => setWalletOpen(true)}
        onSuccess={() => {
          loadFeed();
          loadPosts();
          setPetsRefresh(n => n + 1);
        }}
      />

      <PostComposerModal
        key={`composer-${composer.petTxid ?? 'none'}-${String(composer.open)}`}
        open={composer.open}
        pets={pets}
        initialPetTxid={composer.petTxid}
        onClose={() => setComposer({ open: false })}
        onCreateProfile={() => setProfileModal({ open: true })}
        onRequestWallet={() => setWalletOpen(true)}
        onSuccess={() => {
          loadPosts();
          loadFeed();
        }}
      />

      <PostDetailModal
        open={Boolean(detailPostId)}
        postId={detailPostId}
        petName={
          detailPost
            ? detailPost.pet?.name ||
              petNameByRoot.get(detailPost.petRootTxid.toLowerCase())
            : undefined
        }
        onClose={() => setDetailPostId(null)}
        onChanged={() => loadPosts()}
      />

      <UserWalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
