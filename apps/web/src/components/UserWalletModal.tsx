import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.js';
import { useWallet } from '../wallet/WalletContext.js';

type View = 'auto' | 'create' | 'restore' | 'backup' | 'unlock' | 'menu';

function shortAddress(address: string): string {
  return `${address.slice(0, 14)}…${address.slice(-4)}`;
}

/** Numeric PIN field: 4–12 digits, no letters, keypad on mobile. */
function PinInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={12}
      minLength={4}
      required
      autoFocus={props.autoFocus}
      disabled={props.disabled}
      value={props.value}
      placeholder={props.placeholder}
      onChange={e => props.onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
    />
  );
}

export function UserWalletModal(props: { open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const wallet = useWallet();
  const [view, setView] = useState<View>('auto');
  const [mnemonic, setMnemonic] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saved, setSaved] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [tickNow, setTickNow] = useState(Date.now());

  useEffect(() => {
    if (!props.open) return;
    setLocalError(null);
    setPassphrase('');
    setConfirm('');
    setSaved(false);
    setRevealed(null);
    setDone(false);
    setMnemonic('');
    setCopied(false);
    setFailedAttempts(0);
    setCooldownUntil(0);
    setView('auto');
  }, [props.open]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  if (!props.open) return null;

  const words = mnemonic ? mnemonic.split(' ') : [];
  const pinValid = /^\d{4,12}$/.test(passphrase);
  const canSubmitPass =
    pinValid && (view !== 'create' || passphrase === confirm) && saved;
  const error = localError ?? wallet.error;
  const cooldownRemaining = Math.max(
    0,
    Math.ceil((cooldownUntil - tickNow) / 1000),
  );

  function downloadWords() {
    const body = `${t('seedPhrase')}\n\n${mnemonic}\n\n${t('seedWarning')}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'onest-seed-phrase.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyWords() {
    try {
      await navigator.clipboard.writeText(mnemonic);
    } catch {
      /* ignore */
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitPass) return;
    try {
      await wallet.createProfile(mnemonic, passphrase);
      setDone(true);
    } catch {
      /* error surfaced via context */
    }
  }

  async function handleRestore(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!wallet.validateMnemonic(mnemonic)) {
      setLocalError(t('invalidSeed'));
      return;
    }
    if (passphrase !== confirm) {
      setLocalError(t('pinMismatch'));
      return;
    }
    if (!pinValid) {
      setLocalError(t('pinHint'));
      return;
    }
    try {
      await wallet.restoreProfile(mnemonic, passphrase);
      setDone(true);
    } catch {
      /* error surfaced via context */
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (cooldownRemaining > 0) return;
    try {
      await wallet.unlock(passphrase);
      setFailedAttempts(0);
    } catch {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= 3) {
        setCooldownUntil(Date.now() + 15_000);
      }
    }
  }

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    try {
      setRevealed(await wallet.backup(passphrase));
    } catch {
      /* error surfaced via context */
    }
  }

  function close() {
    setView('auto');
    props.onClose();
  }

  const effectiveView: View =
    view !== 'auto'
      ? view
      : wallet.status === 'none'
        ? 'menu'
        : wallet.status === 'locked'
          ? 'unlock'
          : 'menu';

  return (
    <div className="modal-backdrop" onClick={wallet.busy ? undefined : close}>
      <div className="modal-content wallet-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('userProfile')}</h2>
          {!wallet.busy && (
            <button type="button" className="btn-close" onClick={close}>
              &times;
            </button>
          )}
        </div>

        {done ? (
          <div className="success-container">
            <div className="success-icon">🐾</div>
            <h3>{t('walletReady')}</h3>
            <p className="success-desc">{t('walletReadyHint')}</p>
            <div className="success-tx-box">
              <span className="tx-label">{t('walletAddress')}</span>
              <span className="tx-hash-link">{wallet.address}</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={close}>
                {t('done')}
              </button>
            </div>
          </div>
        ) : wallet.status === 'loading' ? (
          <div className="loading-state">{t('loadingWallet')}</div>
        ) : effectiveView === 'menu' && wallet.status === 'none' ? (
          <div className="wallet-intro">
            <p className="wallet-intro-text">{t('userProfileIntro')}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setMnemonic(wallet.generateMnemonic());
                setView('create');
              }}
            >
              {t('createUserProfile')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setView('restore')}
            >
              {t('restoreUserProfile')}
            </button>
          </div>
        ) : effectiveView === 'menu' ? (
          <div className="wallet-menu">
            <div className="wallet-balance-grid">
              <div className="wallet-balance-card">
                <span className="wallet-balance-label">XEC</span>
                <span className="wallet-balance-value">
                  {wallet.balances
                    ? (Number(wallet.balances.xecSats) / 100).toLocaleString()
                    : '—'}
                </span>
              </div>
              <div className="wallet-balance-card">
                <span className="wallet-balance-label">PAW</span>
                <span className="wallet-balance-value">
                  {wallet.balances ? wallet.balances.pawAtoms.toString() : '—'}
                </span>
              </div>
            </div>
            <div className="wallet-address-row">
              <span className="tx-label">{t('walletAddress')}</span>
              <code className="wallet-address">{wallet.address}</code>
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  if (!wallet.address) return;
                  try {
                    await navigator.clipboard.writeText(wallet.address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {copied ? t('linkCopied') : t('copyAddress')}
              </button>
            </div>
            <p className="pow-hint">{t('depositHint')}</p>
            <div className="wallet-actions">
              <button type="button" className="btn-secondary" onClick={() => wallet.refresh()}>
                {t('refreshBalances')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setView('backup')}>
                {t('backupSeed')}
              </button>
              <button type="button" className="btn-secondary" onClick={wallet.lock}>
                {t('lockWallet')}
              </button>
              <button type="button" className="btn-tribute-link" onClick={() => wallet.wipe()}>
                {t('removeWallet')}
              </button>
            </div>
            <p className="pow-hint">{t('seedWarning')}</p>
          </div>
        ) : effectiveView === 'create' ? (
          <form onSubmit={handleCreate}>
            <p className="seed-warning">{t('seedWarning')}</p>
            <div className="seed-grid">
              {words.map((w, i) => (
                <span key={`${w}-${i}`} className="seed-word">
                  <b>{i + 1}</b> {w}
                </span>
              ))}
            </div>
            <div className="modal-actions seed-actions">
              <button type="button" className="btn-secondary" onClick={copyWords}>
                {t('copyWords')}
              </button>
              <button type="button" className="btn-secondary" onClick={downloadWords}>
                {t('downloadWords')}
              </button>
            </div>
            <label className="seed-confirm">
              <input
                type="checkbox"
                checked={saved}
                onChange={e => setSaved(e.target.checked)}
              />
              {t('iveSavedIt')}
            </label>
            <div className="form-group">
              <label>{t('pin')}</label>
              <PinInput
                value={passphrase}
                onChange={setPassphrase}
                placeholder={t('pinHint')}
                disabled={wallet.busy}
              />
            </div>
            <div className="form-group">
              <label>{t('confirmPin')}</label>
              <PinInput
                value={confirm}
                onChange={setConfirm}
                disabled={wallet.busy}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setView('menu')}>
                {t('back')}
              </button>
              <button type="submit" className="btn-primary" disabled={!canSubmitPass || wallet.busy}>
                {t('createUserProfile')}
              </button>
            </div>
          </form>
        ) : effectiveView === 'restore' ? (
          <form onSubmit={handleRestore}>
            <div className="form-group">
              <label>{t('seedPhrase')}</label>
              <textarea
                rows={3}
                required
                value={mnemonic}
                onChange={e => setMnemonic(e.target.value)}
                placeholder="word1 word2 word3 …"
              />
            </div>
            <div className="form-group">
              <label>{t('pin')}</label>
              <PinInput
                value={passphrase}
                onChange={setPassphrase}
                placeholder={t('pinHint')}
                disabled={wallet.busy}
              />
            </div>
            <div className="form-group">
              <label>{t('confirmPin')}</label>
              <PinInput
                value={confirm}
                onChange={setConfirm}
                disabled={wallet.busy}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setView('menu')}>
                {t('back')}
              </button>
              <button type="submit" className="btn-primary" disabled={wallet.busy}>
                {t('restoreUserProfile')}
              </button>
            </div>
          </form>
        ) : effectiveView === 'backup' ? (
          <form onSubmit={handleReveal}>
            <p className="pow-hint">{t('backupHint')}</p>
            <div className="form-group">
              <label>{t('pin')}</label>
              <PinInput
                value={passphrase}
                onChange={setPassphrase}
                disabled={wallet.busy}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            {revealed && (
              <div className="seed-grid">
                {revealed.split(' ').map((w, i) => (
                  <span key={`${w}-${i}`} className="seed-word">
                    <b>{i + 1}</b> {w}
                  </span>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setView('menu')}>
                {t('back')}
              </button>
              <button type="submit" className="btn-primary" disabled={wallet.busy}>
                {t('backupSeed')}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleUnlock}>
            <div className="wallet-address-row">
              <span className="tx-label">{t('walletAddress')}</span>
              <code className="wallet-address">
                {wallet.address ? shortAddress(wallet.address) : ''}
              </code>
            </div>
            <div className="form-group">
              <label>{t('pin')}</label>
              <PinInput
                value={passphrase}
                onChange={setPassphrase}
                autoFocus
                disabled={wallet.busy || cooldownRemaining > 0}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            {cooldownRemaining > 0 && (
              <p className="pin-cooldown">
                {t('pinCooldown', { seconds: cooldownRemaining })}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={close}>
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={wallet.busy || cooldownRemaining > 0 || passphrase.length < 4}
              >
                {t('unlockWallet')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
