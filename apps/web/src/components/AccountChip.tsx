import { useLocale } from '../i18n/LocaleContext.js';
import { formatXecSats } from '../lib/petUi.js';
import { useWallet } from '../wallet/WalletContext.js';

function shortAddress(address: string): string {
  return `${address.slice(0, 10)}…${address.slice(-4)}`;
}

export function AccountChip({ onOpen }: { onOpen: () => void }) {
  const { t } = useLocale();
  const { status, address, balances } = useWallet();

  let label = t('createUserProfile');
  if (status === 'locked' && address) label = `🔒 ${shortAddress(address)}`;
  if (status === 'unlocked' && address) {
    label = balances
      ? `${formatXecSats(balances.xecSats)} XEC`
      : shortAddress(address);
  }

  return (
    <button
      type="button"
      className={`account-chip account-chip-${status}`}
      onClick={onOpen}
      title={address ?? t('userProfile')}
    >
      {label}
    </button>
  );
}
