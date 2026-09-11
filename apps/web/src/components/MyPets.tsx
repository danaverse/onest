import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import { fetchMyPets, type MyPetSummary } from '../lib/socialApi.js';
import { speciesEmoji } from '../lib/petUi.js';
import { useWallet } from '../wallet/WalletContext.js';

/** "My pets" tab: profiles whose root burn was sent by the user's wallet. */
export function MyPets(props: {
  onOpenPet: (txid: string) => void;
  onCreatePet: () => void;
  onRequestWallet: () => void;
  /** Bump to reload after creating a pet profile. */
  refreshKey?: number;
}) {
  const { t } = useLocale();
  const wallet = useWallet();
  const [pets, setPets] = useState<MyPetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (wallet.status !== 'unlocked' || !wallet.address) {
      setPets([]);
      return;
    }
    setLoading(true);
    setErr(null);
    fetchMyPets(wallet.address)
      .then(list => {
        if (!cancelled) setPets(list);
      })
      .catch(e => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load your pets');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.status, wallet.address, props.refreshKey]);

  return (
    <section className="my-pets-section">
      <div className="feed-head">
        <h2>{t('myPetsTitle')}</h2>
        {wallet.status === 'unlocked' && (
          <button
            type="button"
            className="btn-tribute-link"
            onClick={props.onCreatePet}
          >
            + {t('newProfile')}
          </button>
        )}
      </div>

      {wallet.status !== 'unlocked' ? (
        <div className="create-pet-card">
          <p className="empty-hint">{t('myPetsLocked')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={props.onRequestWallet}
          >
            {wallet.address ? t('unlockWallet') : t('createUserProfile')}
          </button>
        </div>
      ) : loading ? (
        <div className="feed-loading">
          <span className="paw-spinner">🐾</span>
        </div>
      ) : err ? (
        <div className="error-box">{err}</div>
      ) : pets.length === 0 ? (
        <div className="create-pet-card">
          <p className="empty-hint">{t('myPetsEmpty')}</p>
          <button type="button" className="btn-primary" onClick={props.onCreatePet}>
            {t('newProfile')}
          </button>
        </div>
      ) : (
        <div className="profile-grid">
          {pets.map(p => (
            <div
              key={p.txid}
              className="profile-card clickable"
              onClick={() => props.onOpenPet(p.txid)}
            >
              <div className="card-top">
                <span className="page-chip-avatar">{speciesEmoji(p.species)}</span>
                <h3>{p.name}</h3>
              </div>
              <p className="tribute-count">
                🐾 {p.tributes} tribute{p.tributes > 1 ? 's' : ''}
              </p>
              <div className="card-actions">
                <button
                  type="button"
                  className="btn-tribute"
                  onClick={e => {
                    e.stopPropagation();
                    props.onOpenPet(p.txid);
                  }}
                >
                  {t('postsTab')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
