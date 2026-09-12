import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import {
  encodeAnimalProfileNote,
  type AnimalProfileFields,
} from '../../../../src/offering/animalProfileFields.js';
import { PAW_LISTING_FEE_ATOMS } from '../../../../src/params/pawMint.js';
import { createPetProfileWithWallet } from '../lib/profileCreation.js';
import {
  createPaidProfileWithXec,
  fetchProfileFee,
  type ProfileFeeInfo,
} from '../lib/paidProfile.js';
import {
  associateProfileMedia,
  compressAvatar,
  compressBanner,
  queueProfileMedia,
  uploadImage,
} from '../lib/socialApi.js';
import { runSponsoredOffer } from '../lib/offerRunner.js';
import { setOfferingBlocksPwaReload } from '../lib/pwaReloadGate.js';
import { useWallet } from '../wallet/WalletContext.js';

/** 6 PAW burned for the memorial (rebirth) + the desk listing fee. */
const MIN_PROFILE_PAW = PAW_LISTING_FEE_ATOMS + 6n;
const MIN_PROFILE_XEC_SATS = 2_000n;
/** Flat XEC fee (2,000 sats) plus network fees for the desk-paid path. */
const MIN_PAY_XEC_SATS = 2_500n;

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
  const [profileFee, setProfileFee] = useState<ProfileFeeInfo | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    },
    [avatarPreview, bannerPreview],
  );

  useEffect(() => {
    if (!props.open || props.parentBurnTxid) return;
    let cancelled = false;
    fetchProfileFee()
      .then(fee => {
        if (!cancelled) setProfileFee(fee);
      })
      .catch(() => {
        /* fall back to the generic button label */
      });
    return () => {
      cancelled = true;
    };
  }, [props.open, props.parentBurnTxid]);

  if (!props.open) return null;

  const isCreate = !props.parentBurnTxid;
  const unlocked = userWallet.status === 'unlocked';
  const pawAtoms = userWallet.balances?.pawAtoms ?? 0n;
  const xecSats = userWallet.balances?.xecSats ?? 0n;
  /** Single action: PAW path when the wallet holds PAW, else pay XEC. */
  const payMode = isCreate && unlocked && pawAtoms < MIN_PROFILE_PAW;
  const neededXec = payMode ? MIN_PAY_XEC_SATS : MIN_PROFILE_XEC_SATS;
  const xecShort = unlocked && xecSats < neededXec;

  function buildProfileFields(): AnimalProfileFields {
    return {
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
  }

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
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreview(null);
    setBannerPreview(null);
  }

  function pickArtwork(kind: 'avatar' | 'banner', file: File | null) {
    const url = file ? URL.createObjectURL(file) : null;
    if (kind === 'avatar') {
      setAvatarFile(file);
      setAvatarPreview(url);
    } else {
      setBannerFile(file);
      setBannerPreview(url);
    }
  }

  /** Upload chosen artwork before the on-chain profile is created. */
  async function uploadArtwork(): Promise<{
    avatar?: string | null;
    banner?: string | null;
  }> {
    const links: { avatar?: string | null; banner?: string | null } = {};
    if (avatarFile) {
      setProgress(t('uploadingPhotos'));
      const { blob } = await compressAvatar(avatarFile);
      links.avatar = (await uploadImage(blob)).sha256;
    }
    if (bannerFile) {
      setProgress(t('uploadingPhotos'));
      const { blob } = await compressBanner(bannerFile);
      links.banner = (await uploadImage(blob)).sha256;
    }
    return links;
  }

  /** Link uploaded artwork to the new root; queue for retry when slow. */
  async function linkArtwork(
    txid: string,
    links: { avatar?: string | null; banner?: string | null },
  ) {
    if (links.avatar === undefined && links.banner === undefined) return;
    setProgress(t('associatingPhotos'));
    try {
      await associateProfileMedia(txid, links);
    } catch {
      queueProfileMedia({ txid, ...links });
    }
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
      if (!unlocked) {
        setErr(t('userProfileRequired'));
        props.onRequestWallet?.();
        return;
      }
      if (payMode) {
        await handlePayXec();
      } else {
        await handleCreateProfile();
      }
      return;
    }
    await handleSponsoredTribute();
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
      const links = await uploadArtwork();
      setProgress(t('creatingProfileWallet'));
      const { txid } = await createPetProfileWithWallet({
        wallet: userWallet.wallet,
        fields: buildProfileFields(),
      });
      await linkArtwork(txid, links);
      setSuccessTxid(txid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error creating profile');
    } finally {
      setOfferingBlocksPwaReload(false);
      setBusy(false);
      setProgress(null);
    }
  }

  async function handlePayXec() {
    if (userWallet.status !== 'unlocked' || !userWallet.wallet) {
      setErr(t('userProfileRequired'));
      props.onRequestWallet?.();
      return;
    }
    setBusy(true);
    setErr(null);
    setSuccessTxid(null);
    setProgress(null);
    setOfferingBlocksPwaReload(true);
    try {
      const links = await uploadArtwork();
      const note = encodeAnimalProfileNote(buildProfileFields());
      const { burnTxid } = await createPaidProfileWithXec({
        wallet: userWallet.wallet,
        note,
        onProgress: setProgress,
      });
      await linkArtwork(burnTxid, links);
      setSuccessTxid(burnTxid);
      await userWallet.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Profile payment failed';
      setErr(msg === 'PAY_NEED_XEC' ? t('payNeedXec') : msg);
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
      <div className="modal-content profile-modal" onClick={e => e.stopPropagation()}>
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

                <div className="form-group">
                  <label>{t('avatar')}</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={e => pickArtwork('avatar', e.target.files?.[0] ?? null)}
                  />
                  {avatarPreview && (
                    <img
                      className="artwork-preview artwork-preview--avatar"
                      src={avatarPreview}
                      alt=""
                    />
                  )}
                </div>

                <div className="form-group">
                  <label>{t('banner')}</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={e => pickArtwork('banner', e.target.files?.[0] ?? null)}
                  />
                  {bannerPreview && (
                    <img
                      className="artwork-preview artwork-preview--banner"
                      src={bannerPreview}
                      alt=""
                    />
                  )}
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

            {isCreate && !busy && (!unlocked || xecShort) && (
              <div className="wallet-gate">
                <p>
                  {!unlocked
                    ? t('userProfileRequired')
                    : t('needXecForProfile')}
                </p>
                {userWallet.address && (
                  <code className="wallet-address">{userWallet.address}</code>
                )}
                <button
                  type="button"
                  className="btn-tribute-link"
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
              {isCreate && !unlocked ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => props.onRequestWallet?.()}
                >
                  {userWallet.address ? t('unlockWallet') : t('createUserProfile')}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={
                    busy ||
                    xecShort ||
                    (props.parentBurnTxid ? !note.trim() : !name.trim())
                  }
                  className="btn-primary"
                >
                  {busy
                    ? t('posting')
                    : payMode
                      ? profileFee
                        ? t('payToCreateWithXec', { xec: profileFee.xec })
                        : t('payToCreate')
                      : t('submitTribute')}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
