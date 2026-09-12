import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import {
  compressImage,
  createPost,
  mediaUrl,
  pollPostVerified,
  uploadImage,
} from '../lib/socialApi.js';
import {
  createPaidPostWithXec,
  createPostWithPaw,
  fetchPostFee,
  MIN_POST_PAW_XEC_SATS,
} from '../lib/paidPost.js';
import { runSponsoredOffer } from '../lib/offerRunner.js';
import { speciesEmoji } from '../lib/petUi.js';
import { useWallet } from '../wallet/WalletContext.js';

export interface PetOption {
  txid: string;
  name: string;
  species?: string;
  avatar?: string | null;
  /** True when this install/wallet created the pet profile. */
  isOwn?: boolean;
}

export function PostComposerModal(props: {
  open: boolean;
  pets: PetOption[];
  initialPetTxid?: string;
  onClose: () => void;
  onSuccess?: () => void;
  onCreateProfile?: () => void;
  onRequestWallet?: () => void;
}) {
  const { t } = useLocale();
  const userWallet = useWallet();
  const [petTxid, setPetTxid] = useState(
    props.initialPetTxid || props.pets[0]?.txid || '',
  );
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ postId: string; burnTxid: string; pending: boolean } | null>(
    null,
  );
  const [postFeeSats, setPostFeeSats] = useState<bigint | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  /* Keep the preselected pet visible when the popup opens. */
  useEffect(() => {
    if (!props.open) return;
    stripRef.current
      ?.querySelector('.pet-picker.selected')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [props.open, petTxid]);

  /* Post fee decides paid vs desk-sponsored (1 atom, ~1 min wait). */
  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    fetchPostFee()
      .then(fee => {
        if (!cancelled) setPostFeeSats(BigInt(fee.xecSats));
      })
      .catch(() => {
        if (!cancelled) setPostFeeSats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [props.open]);

  if (!props.open) return null;

  const xecSats = userWallet.balances?.xecSats ?? 0n;
  const pawAtoms = userWallet.balances?.pawAtoms ?? 0n;
  const selectedPet = props.pets.find(p => p.txid === petTxid);
  const isOwnPet = selectedPet?.isOwn === true;
  const canPayXec = postFeeSats != null && xecSats >= postFeeSats + 500n;
  /** Other pets need payment: prefer burning 1 PAW when the wallet holds it. */
  const usePaw = !isOwnPet && pawAtoms >= 1n && xecSats >= MIN_POST_PAW_XEC_SATS;
  /** Desk-sponsored posts are only for the user's own pets. */
  const sponsoredAvailable =
    userWallet.status === 'unlocked' && isOwnPet && postFeeSats != null && !canPayXec;
  const blocked =
    userWallet.status === 'unlocked' &&
    postFeeSats != null &&
    !sponsoredAvailable &&
    !canPayXec &&
    !usePaw;

  function resetForm() {
    setCaption('');
    setFiles([]);
    setErr(null);
    setProgress(null);
    setSuccess(null);
  }

  function handleClose() {
    if (busy) return;
    const finished = Boolean(success);
    resetForm();
    if (finished) props.onSuccess?.();
    props.onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || blocked || !petTxid || !caption.trim()) return;
    if (userWallet.status !== 'unlocked' || !userWallet.wallet) {
      setErr(t('userProfileRequired'));
      props.onRequestWallet?.();
      return;
    }
    setBusy(true);
    setErr(null);
    setSuccess(null);

    try {
      const mediaHashes: string[] = [];
      for (const file of files.slice(0, 4)) {
        setProgress(t('uploadingPhotos'));
        const { blob } = await compressImage(file);
        const uploaded = await uploadImage(blob);
        mediaHashes.push(uploaded.sha256);
      }

      setProgress(t('creatingPost'));
      const created = await createPost({
        petRootTxid: petTxid,
        caption: caption.trim(),
        mediaHashes,
        createdAt: Date.now(),
      });

      const burnTxid = sponsoredAvailable
        ? (
            await runSponsoredOffer({
              kind: 'post',
              contentHash: created.contentHash,
              petRootTxid: petTxid,
              onProgress: setProgress,
            })
          ).burnTxid
        : usePaw
          ? (
              await createPostWithPaw({
                wallet: userWallet.wallet,
                contentHash: created.contentHash,
                onProgress: setProgress,
              })
            ).burnTxid
          : (
              await createPaidPostWithXec({
                wallet: userWallet.wallet,
                contentHash: created.contentHash,
                onProgress: setProgress,
              })
            ).burnTxid;

      setProgress(t('verifyingPost'));
      const verified = await pollPostVerified(created.id);
      setSuccess({
        postId: created.id,
        burnTxid,
        pending: !verified,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not share this moment';
      setErr(msg === 'POST_NEED_XEC' ? t('postNeedXec') : msg);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : handleClose}>
      <div className="modal-content post-composer-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{success ? t('postSuccess') : t('shareMoment')}</h2>
          {!busy && (
            <button type="button" className="btn-close" onClick={handleClose}>
              &times;
            </button>
          )}
        </div>

        {success ? (
          <div className="success-container">
            <div className="success-icon">🐾</div>
            <h3>{t('postSuccess')}</h3>
            <p className="success-desc">
              {success.pending ? t('postPendingHint') : t('postVerifiedHint')}
            </p>
            <div className="success-tx-box">
              <span className="tx-label">{t('burnTxid')}:</span>
              <a
                href={`https://danaverse.org/offering/${success.burnTxid}`}
                target="_blank"
                rel="noreferrer"
                className="tx-hash-link"
              >
                {success.burnTxid}
              </a>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={handleClose} className="btn-primary">
                {t('done')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {props.pets.length > 0 ? (
              <div className="form-group">
                <label>{t('choosePet')}</label>
                <div className="pet-picker-strip" ref={stripRef}>
                  {props.pets.map(p => (
                    <button
                      key={p.txid}
                      type="button"
                      className={`pet-picker${p.txid === petTxid ? ' selected' : ''}`}
                      disabled={busy}
                      aria-pressed={p.txid === petTxid}
                      onClick={() => setPetTxid(p.txid)}
                    >
                      <span className="pet-picker-avatar">
                        {p.avatar ? (
                          <img src={mediaUrl(p.avatar)} alt="" loading="lazy" />
                        ) : (
                          speciesEmoji(p.species)
                        )}
                      </span>
                      <span className="pet-picker-name">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-hint-block">
                <p className="empty-hint">{t('createProfileFirst')}</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    props.onClose();
                    props.onCreateProfile?.();
                  }}
                >
                  {t('newProfile')}
                </button>
              </div>
            )}

            <div className="form-group">
              <label>{t('photo')}</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy}
                onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 4))}
              />
            </div>

            <div className="form-group">
              <label>{t('caption')}</label>
              <textarea
                required
                rows={3}
                disabled={busy}
                value={caption}
                maxLength={500}
                onChange={e => setCaption(e.target.value)}
                placeholder={t('captionPlaceholder')}
              />
            </div>

            {err && <div className="error-box">{err}</div>}
            {progress && <div className="status-box">{progress}</div>}
            {!busy && (
              <p className="pow-hint">
                {blocked
                  ? t('postNeedPawOrXec')
                  : sponsoredAvailable
                    ? t('sponsoredPostHint')
                    : usePaw
                      ? t('postOtherPetHint')
                      : t('postFeeHint')}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={handleClose} className="btn-secondary">
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={busy || blocked || !petTxid || !caption.trim()}
                className="btn-primary"
              >
                {busy
                  ? t('posting')
                  : sponsoredAvailable
                    ? t('sponsoredPostButton')
                    : usePaw
                      ? t('postPawButton')
                      : t('postSubmit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
