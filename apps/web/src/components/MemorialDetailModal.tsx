import { useState, useEffect } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import {
  fetchMemorialDetails,
  type IndexMemorialGroup,
} from '../lib/danaIndexApi.js';
import {
  parseAnimalProfileNote,
  profileBareNameFromNote,
} from '../../../../src/offering/animalProfileFields.js';
import { BrandMark } from './BrandMark.js';

function speciesEmoji(species: string): string {
  switch (species.toLowerCase()) {
    case 'dog':
      return '🐕';
    case 'cat':
      return '🐈';
    case 'bird':
      return '🦜';
    case 'rabbit':
      return '🐇';
    case 'horse':
      return '🐴';
    default:
      return '🐾';
  }
}

export function MemorialDetailModal(props: {
  open: boolean;
  txid: string | null;
  onClose: () => void;
  onLeaveTribute: (rootTxid: string) => void;
  onLeavePost?: (rootTxid: string, petName: string) => void;
}) {
  const { t } = useLocale();
  const [memorial, setMemorial] = useState<IndexMemorialGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (props.open && props.txid) {
      setLoading(true);
      setErr(null);
      fetchMemorialDetails(props.txid)
        .then(m => {
          setMemorial(m);
        })
        .catch(e => {
          setErr(e?.message || 'Could not load memory details');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setMemorial(null);
    }
  }, [props.open, props.txid]);

  if (!props.open) return null;

  const parsed = memorial ? parseAnimalProfileNote(memorial.originalNote) : null;
  const name = memorial ? profileBareNameFromNote(memorial.originalNote) || 'Animal Friend' : '';
  const species = parsed?.species || '';
  const breed = parsed?.breed || '';
  const birth = parsed?.birthDate || '';
  const passing = parsed?.passingDate || '';
  const story = parsed?.note || (parsed ? '' : memorial?.originalNote) || '';

  const childTributes = (memorial?.burns ?? []).filter(
    b => b.burnTxid.toLowerCase() !== memorial?.originalBurnTxid.toLowerCase(),
  );

  async function handleShare() {
    if (!memorial) return;
    const shareUrl = `${window.location.origin}/${memorial.originalBurnTxid}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-content memorial-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="detail-title-row">
            <span className="species-badge">{speciesEmoji(species)}</span>
            <h2>{name}</h2>
          </div>
          <button type="button" className="btn-close" onClick={props.onClose}>
            &times;
          </button>
        </div>

        {loading && <div className="loading-state">Loading memory details...</div>}
        {err && <div className="error-box">{err}</div>}

        {memorial && (
          <div className="detail-body">
            <div className="detail-meta">
              {breed && <span className="meta-tag">{breed}</span>}
              {(birth || passing) && (
                <span className="meta-tag">
                  {birth && passing ? `${birth} — ${passing}` : birth ? `Born ${birth}` : `Passed ${passing}`}
                </span>
              )}
              <span className="meta-tag paw-tag">🐾 {memorial.totalBurns} paw print{memorial.totalBurns > 1 ? 's' : ''}</span>
            </div>

            {story && (
              <div className="memorial-story">
                <p>{story}</p>
              </div>
            )}

            <div className="detail-actions">
              <button
                type="button"
                className="btn-primary btn-action-tribute"
                onClick={() => props.onLeaveTribute(memorial.originalBurnTxid)}
              >
                🐾 {t('pawTribute')}
              </button>
              <button
                type="button"
                className="btn-secondary btn-action-share"
                onClick={() => props.onLeavePost?.(memorial.originalBurnTxid, name)}
              >
                📸 {t('shareMoment')}
              </button>
              <button type="button" className="btn-secondary btn-action-share" onClick={handleShare}>
                {copied ? '✓ Link Copied!' : 'Share Profile'}
              </button>
            </div>

            <div className="tribute-wall">
              <h3>Paw-Print Tributes ({childTributes.length})</h3>
              {childTributes.length > 0 ? (
                <ul className="tribute-wall-list">
                  {childTributes.map(b => (
                    <li key={b.burnTxid} className="tribute-wall-item">
                      <span className="paw-bullet">🐾</span>
                      <div className="wall-item-content">
                        <p className="wall-item-note">{b.note || 'Dedicated a loving paw print'}</p>
                        <div className="wall-item-meta">
                          <span className="wall-item-time">{new Date(b.timeFirstSeen).toLocaleDateString()}</span>
                          <a
                            href={`https://danaverse.org/offering/${b.burnTxid}`}
                            target="_blank"
                            rel="noreferrer"
                            className="tx-link"
                          >
                            {b.burnTxid.slice(0, 8)}...
                          </a>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-tributes-yet">Be the first to leave a paw print tribute for {name}!</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
