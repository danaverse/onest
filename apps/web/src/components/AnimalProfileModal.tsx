import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import {
  encodeAnimalProfileNote,
  type AnimalProfileFields,
} from '../../../../src/offering/animalProfileFields.js';
import { PAW_LISTING_FEE_ATOMS } from '../../../../src/params/pawMint.js';
import { createPetProfileWithWallet } from '../lib/profileCreation.js';
import { runSponsoredOffer } from '../lib/offerRunner.js';
import { setOfferingBlocksPwaReload } from '../lib/pwaReloadGate.js';
import { useWallet } from '../wallet/WalletContext.js';

const MIN_PROFILE_PAW = PAW_LISTING_FEE_ATOMS + 1n;
const MIN_PROFILE_XEC_SATS = 2_000n;

export function AnimalProfileModal(props: {
  open: boolean;
  onClose: () => void;
  parentBurnTxid?: string;
  onSuccess?: (txid: string) => void;
  onRequestWallet?: () => void;
}) {
  const { t } = useLocale();
  const userWallet = useWallet();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<'dog' | 'cat' | 'bird' | 'rabbit' | 'horse' | 'other'>('dog');
  const [breed, setBreed] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [passingDate, setPassingDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [successTxid, setSuccessTxid] = useState<string | null>(null);

  if (!props.open) return null;

  const isCreate = !props.parentBurnTxid;

  function resetForm() {
    setName('');
    setSpecies('dog');
    setBreed('');
    setBirthDate('');
    setPassingDate('');
    setNote('');
    setErr(null);
    setProgress(null);
    setSuccessTxid(null);
  }

  function handleClose() {
    if (busy) return;
    const finishedTxid = successTxid;
    resetForm();
    if (finishedTxid) {
      props.onSuccess?.(finishedTxid);
    }
    props.onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isCreate ? !name.trim() : !note.trim()) return;
    if (isCreate) {
      await handleCreateProfile();
    } else {
      await handleSponsoredTribute();
    }
  }

  async function handleCreateProfile() {
    if (userWallet.status !== 'unlocked' || !userWallet.wallet) {
      setErr(t('userProfileRequired'));
      props.onRequestWallet?.();
      return;
    }
    const paw = userWallet.balances?.pawAtoms ?? 0n;
    const xec = userWallet.balances?.xecSats ?? 0n;
    if (paw < MIN_PROFILE_PAW) {
      setErr(t('needPawForProfile', { atoms: Number(MIN_PROFILE_PAW) }));
      return;
    }
    if (xec < MIN_PROFILE_XEC_SATS) {
      setErr(t('needXecForProfile'));
      return;
    }

    setBusy(true);
    setErr(null);
    setSuccessTxid(null);
    setOfferingBlocksPwaReload(true);
    try {
      setProgress(t('creatingProfileWallet'));
      const fields: AnimalProfileFields = {
        species,
        name: name.trim(),
        breed: breed.trim(),
        birthDate: birthDate.trim(),
        passingDate: passingDate.trim(),
        note: note.trim(),
        location: '',
        memorialPlace: '',
        relationshipType: '',
        relatedTxid: '',
        relationships: [],
        kind: 'memorial',
        dateCalendar: 'solar',
      };
      const { txid } = await createPetProfileWithWallet({
        wallet: userWallet.wallet,
        fields,
      });
      setSuccessTxid(txid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error creating profile');
    } finally {
      setOfferingBlocksPwaReload(false);
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleSponsoredTribute() {
    setBusy(true);
    setErr(null);
    setSuccessTxid(null);
    setOfferingBlocksPwaReload(true);
    try {
      const result = await runSponsoredOffer({
        kind: 'memorial',
        note: note.trim(),
        parentBurnTxid: props.parentBurnTxid,
        onProgress: setProgress,
      });
      setSuccessTxid(result.burnTxid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error creating profile');
    } finally {
      setOfferingBlocksPwaReload(false);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{successTxid ? t('tributeSuccess') : props.parentBurnTxid ? t('pawTribute') : t('newProfile')}</h2>
          {!busy && <button type="button" className="btn-close" onClick={handleClose}>&times;</button>}
        </div>

        {successTxid ? (
          <div className="success-container">
            <div className="success-icon">🐾</div>
            <h3>{t('tributeSuccess')}</h3>
            <p className="success-desc">
              Your loving paw-print tribute has been preserved forever.
            </p>
            <div className="success-tx-box">
              <span className="tx-label">Transaction ID:</span>
              <a
                href={`https://danaverse.org/offering/${successTxid}`}
                target="_blank"
                rel="noreferrer"
                className="tx-hash-link"
              >
                {successTxid}
              </a>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={handleClose} className="btn-primary">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {!props.parentBurnTxid ? (
              <>
                <div className="form-group">
                  <label>{t('petName')}</label>
                  <input
                    type="text"
                    required
                    disabled={busy}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Luna, Milo..."
                  />
                </div>

                <div className="form-group">
                  <label>{t('species')}</label>
                  <select
                    value={species}
                    disabled={busy}
                    onChange={e => setSpecies(e.target.value as any)}
                  >
                    <option value="dog">Dog / Chó / 狗</option>
                    <option value="cat">Cat / Mèo / 猫</option>
                    <option value="bird">Bird / Chim / 鸟</option>
                    <option value="rabbit">Rabbit / Thỏ / 兔子</option>
                    <option value="horse">Horse / Ngựa / 马</option>
                    <option value="other">Other / Khác / 其他</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>{t('breed')}</label>
                  <input
                    type="text"
                    disabled={busy}
                    value={breed}
                    onChange={e => setBreed(e.target.value)}
                    placeholder="e.g. Golden Retriever, Corgi..."
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('birthDate')}</label>
                    <input
                      type="text"
                      disabled={busy}
                      value={birthDate}
                      onChange={e => setBirthDate(e.target.value)}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('passingDate')}</label>
                    <input
                      type="text"
                      disabled={busy}
                      value={passingDate}
                      onChange={e => setPassingDate(e.target.value)}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="tribute-parent-hint">
                <p>Dedicate a loving paw-print tribute to this animal memory.</p>
              </div>
            )}

            <div className="form-group">
              <label>{t('tributeWords')}</label>
              <textarea
                disabled={busy}
                required={Boolean(props.parentBurnTxid)}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={props.parentBurnTxid ? "Remembering you always... 🐾" : "Forever running in sunny meadows..."}
                rows={3}
              />
            </div>

            {err && <div className="error-box">{err}</div>}
            {progress && <div className="status-box">{progress}</div>}

            {isCreate &&
              !busy &&
              (userWallet.status !== 'unlocked' ||
                (userWallet.balances != null &&
                  (userWallet.balances.pawAtoms < MIN_PROFILE_PAW ||
                    userWallet.balances.xecSats < MIN_PROFILE_XEC_SATS))) && (
                <div className="wallet-gate">
                  <p>
                    {userWallet.status !== 'unlocked'
                      ? t('userProfileRequired')
                      : userWallet.balances != null &&
                          userWallet.balances.pawAtoms < MIN_PROFILE_PAW
                        ? t('needPawForProfile', { atoms: Number(MIN_PROFILE_PAW) })
                        : t('needXecForProfile')}
                  </p>
                  {userWallet.address && (
                    <code className="wallet-address">{userWallet.address}</code>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => props.onRequestWallet?.()}
                  >
                    {userWallet.address ? t('openUserProfile') : t('createUserProfile')}
                  </button>
                </div>
              )}

            {!busy && (
              <p className="pow-hint">
                {isCreate ? t('profileFeeHint', { atoms: Number(PAW_LISTING_FEE_ATOMS) }) : t('powHint')}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={handleClose} className="btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || (props.parentBurnTxid ? !note.trim() : !name.trim())}
                className="btn-primary"
              >
                {busy ? t('miningTribute') : t('submitTribute')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
