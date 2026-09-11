/**
 * Wallet context — in-memory unlocked wallet + persisted encrypted vault.
 * The mnemonic/private key never leave this provider except for explicit backup.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Wallet } from 'ecash-wallet';
import {
  bindWalletProfile,
  createVault,
  exportVaultMnemonic,
  fetchWalletBalances,
  generateUserMnemonic,
  readVault,
  removeVault,
  unlockVault,
  validateUserMnemonic,
  walletFromMnemonic,
  type WalletBalances,
} from '../lib/userWallet.js';

export type WalletStatus = 'loading' | 'none' | 'locked' | 'unlocked';

interface WalletCtx {
  status: WalletStatus;
  address: string | null;
  /** Stored PIN length (metadata) for auto-unlock at full entry. */
  pinLength: number | null;
  balances: WalletBalances | null;
  wallet: Wallet | null;
  busy: boolean;
  error: string | null;
  clearError(): void;
  generateMnemonic(): string;
  validateMnemonic(mnemonic: string): boolean;
  createProfile(mnemonic: string, passphrase: string): Promise<void>;
  restoreProfile(mnemonic: string, passphrase: string): Promise<void>;
  /** Returns the unlocked wallet so callers can continue in the same step. */
  unlock(passphrase: string): Promise<Wallet>;
  lock(): void;
  refresh(): Promise<void>;
  backup(passphrase: string): Promise<string>;
  wipe(): Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('loading');
  const [address, setAddress] = useState<string | null>(null);
  const [pinLength, setPinLength] = useState<number | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readVault()
      .then(vault => {
        if (cancelled) return;
        if (vault) {
          setAddress(vault.address);
          setPinLength(vault.pinLength ?? null);
          setStatus('locked');
        } else {
          setStatus('none');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('none');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const current = wallet;
    if (!current) return;
    try {
      setBalances(await fetchWalletBalances(current));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wallet balances');
    }
  }, [wallet]);

  const activate = useCallback(async (nextWallet: Wallet) => {
    setWallet(nextWallet);
    setAddress(nextWallet.address);
    setStatus('unlocked');
    try {
      await bindWalletProfile(nextWallet);
    } catch {
      /* binding is retried on next unlock; not fatal */
    }
    try {
      setBalances(await fetchWalletBalances(nextWallet));
    } catch {
      setBalances(null);
    }
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Wallet error');
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const createProfile = useCallback(
    (mnemonic: string, passphrase: string) =>
      run(async () => {
        const vault = await createVault(mnemonic, passphrase);
        setPinLength(vault.pinLength ?? passphrase.trim().length);
        await activate(await walletFromMnemonic(mnemonic));
      }),
    [activate, run],
  );

  const restoreProfile = useCallback(
    (mnemonic: string, passphrase: string) =>
      run(async () => {
        if (!validateUserMnemonic(mnemonic)) {
          throw new Error('Invalid seed phrase');
        }
        const vault = await createVault(mnemonic, passphrase);
        setPinLength(vault.pinLength ?? passphrase.trim().length);
        await activate(await walletFromMnemonic(mnemonic));
      }),
    [activate, run],
  );

  const unlock = useCallback(
    (passphrase: string) =>
      run(async () => {
        const { wallet: unlocked } = await unlockVault(passphrase);
        await activate(unlocked);
        return unlocked;
      }),
    [activate, run],
  );

  const lock = useCallback(() => {
    setWallet(null);
    setBalances(null);
    setStatus(address ? 'locked' : 'none');
  }, [address]);

  const backup = useCallback(
    (passphrase: string) => exportVaultMnemonic(passphrase),
    [],
  );

  const wipe = useCallback(
    () =>
      run(async () => {
        await removeVault();
        setWallet(null);
        setBalances(null);
        setAddress(null);
        setPinLength(null);
        setStatus('none');
      }),
    [run],
  );

  return (
    <Ctx.Provider
      value={{
        status,
        address,
        pinLength,
        balances,
        wallet,
        busy,
        error,
        clearError: () => setError(null),
        generateMnemonic: generateUserMnemonic,
        validateMnemonic: validateUserMnemonic,
        createProfile,
        restoreProfile,
        unlock,
        lock,
        refresh,
        backup,
        wipe,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
