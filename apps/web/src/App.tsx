import { useState, useEffect } from 'react';
import { useLocale } from './i18n/LocaleContext.js';
import { BrandMark } from './components/BrandMark.js';
import { Header } from './components/Header.js';
import { AnimalProfileModal } from './components/AnimalProfileModal.js';
import { MemorialDetailModal } from './components/MemorialDetailModal.js';
import {
  fetchRecentBurns,
  fetchTrendingProfiles,
  searchProfiles,
  type IndexBurn,
  type IndexMemorialGroup,
} from './lib/danaIndexApi.js';
import { profileBareNameFromNote } from '../../../src/offering/animalProfileFields.js';

export default function App() {
  const { t } = useLocale();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedParentTxid, setSelectedParentTxid] = useState<string | undefined>();
  const [detailTxid, setDetailTxid] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [recent, setRecent] = useState<IndexBurn[]>([]);
  const [trending, setTrending] = useState<IndexMemorialGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IndexMemorialGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeed();
    checkUrlPath();

    const handlePopState = () => {
      checkUrlPath();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function checkUrlPath() {
    const path = window.location.pathname.replace(/^\//, '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(path)) {
      setDetailTxid(path);
      setDetailOpen(true);
    }
  }

  function openDetail(txid: string) {
    setDetailTxid(txid);
    setDetailOpen(true);
    window.history.pushState(null, '', `/${txid}`);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailTxid(null);
    window.history.pushState(null, '', '/');
  }

  async function loadFeed() {
    try {
      setLoading(true);
      const [r, tr] = await Promise.all([
        fetchRecentBurns(20).catch(() => []),
        fetchTrendingProfiles(6).catch(() => []),
      ]);
      setRecent(r);
      setTrending(tr);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const results = await searchProfiles(searchQuery.trim()).catch(() => []);
    setSearchResults(results);
  }

  const hasNoData = !loading && !searchResults && trending.length === 0 && recent.length === 0;

  return (
    <div className="onest-app">
      <header className="onest-header">
        <div className="header-brand">
          <BrandMark width={36} height={36} className="brand-logo" />
          <div>
            <h1 className="brand-title">{t('brand')}</h1>
            <p className="brand-tagline">{t('tagline')}</p>
          </div>
        </div>
        <Header />
      </header>

      <main className="onest-main">
        <section className="hero-action">
          <button
            type="button"
            className="btn-create-profile"
            onClick={() => {
              setSelectedParentTxid(undefined);
              setModalOpen(true);
            }}
          >
            <BrandMark width={20} height={20} />
            <span>{t('newProfile')}</span>
          </button>
        </section>

        <section className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults(null);
              }}
            />
            <button type="submit" className="btn-search">Search</button>
          </form>
        </section>

        {loading && (
          <div className="feed-loading">
            <span className="paw-spinner">🐾</span>
            <p>Loading animal memorials...</p>
          </div>
        )}

        {hasNoData && (
          <section className="empty-welcome-card">
            <div className="welcome-icon">🐾</div>
            <h2>Welcome to Onest</h2>
            <p className="welcome-text">
              Preserve the eternal memory of your beloved animal companions on the eCash blockchain.
              Create an on-chain animal memorial profile and dedicate paw-print tributes powered by proof-of-work minting.
            </p>
            <button
              type="button"
              className="btn-create-profile btn-welcome-action"
              onClick={() => {
                setSelectedParentTxid(undefined);
                setModalOpen(true);
              }}
            >
              <BrandMark width={20} height={20} />
              <span>{t('newProfile')}</span>
            </button>
          </section>
        )}

        {searchResults && (
          <section className="profiles-section">
            <h2>Search Results</h2>
            <div className="profile-grid">
              {searchResults.map(g => (
                <div
                  key={g.originalBurnTxid}
                  className="profile-card clickable"
                  onClick={() => openDetail(g.originalBurnTxid)}
                >
                  <div className="card-top">
                    <BrandMark width={24} height={24} className="pet-icon" />
                    <h3>{profileBareNameFromNote(g.originalNote) || 'Animal Friend'}</h3>
                  </div>
                  <p className="tribute-count">🐾 {g.totalBurns} paw print{g.totalBurns > 1 ? 's' : ''}</p>
                  <div className="card-actions" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-tribute"
                      onClick={() => {
                        setSelectedParentTxid(g.originalBurnTxid);
                        setModalOpen(true);
                      }}
                    >
                      {t('pawTribute')}
                    </button>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && <p className="empty-hint">{t('noProfilesFound')}</p>}
            </div>
          </section>
        )}

        {trending.length > 0 && !searchResults && (
          <section className="profiles-section">
            <h2>{t('trendingPets')}</h2>
            <div className="profile-grid">
              {trending.map(g => (
                <div
                  key={g.originalBurnTxid}
                  className="profile-card clickable"
                  onClick={() => openDetail(g.originalBurnTxid)}
                >
                  <div className="card-top">
                    <BrandMark width={24} height={24} className="pet-icon" />
                    <h3>{profileBareNameFromNote(g.originalNote) || 'Beloved Pet'}</h3>
                  </div>
                  <p className="tribute-count">🐾 {g.totalBurns} paw print{g.totalBurns > 1 ? 's' : ''}</p>
                  <div className="card-actions" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-tribute"
                      onClick={() => {
                        setSelectedParentTxid(g.originalBurnTxid);
                        setModalOpen(true);
                      }}
                    >
                      {t('pawTribute')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && !searchResults && (
          <section className="recent-section">
            <h2>{t('recentTributes')}</h2>
            <ul className="tribute-list">
              {recent.map(b => (
                <li key={b.burnTxid} className="tribute-item">
                  <span className="paw-bullet">🐾</span>
                  <div className="tribute-details">
                    <span
                      className="tribute-note clickable-text"
                      onClick={() => openDetail(b.originalBurnTxid || b.burnTxid)}
                    >
                      {profileBareNameFromNote(b.note) || 'A loving paw print tribute'}
                    </span>
                    <button
                      type="button"
                      className="btn-tribute-link"
                      onClick={() => {
                        setSelectedParentTxid(b.originalBurnTxid || b.burnTxid);
                        setModalOpen(true);
                      }}
                    >
                      {t('pawTribute')}
                    </button>
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
      </main>

      <AnimalProfileModal
        open={modalOpen}
        parentBurnTxid={selectedParentTxid}
        onClose={() => setModalOpen(false)}
        onSuccess={() => loadFeed()}
      />

      <MemorialDetailModal
        open={detailOpen}
        txid={detailTxid}
        onClose={closeDetail}
        onLeaveTribute={rootTxid => {
          setSelectedParentTxid(rootTxid);
          setModalOpen(true);
        }}
      />
    </div>
  );
}
