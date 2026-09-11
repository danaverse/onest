import { useLocale } from '../i18n/LocaleContext.js';
import type { IndexMemorialGroup } from '../lib/danaIndexApi.js';
import {
  parseAnimalProfileNote,
  profileBareNameFromNote,
} from '../../../../src/offering/animalProfileFields.js';
import { relativeTime, speciesEmoji } from '../lib/petUi.js';

/** Horizontal strip of recently created pet profiles (emoji avatar for now). */
export function RecentFootprints(props: {
  profiles: IndexMemorialGroup[];
  onOpenPet: (txid: string) => void;
}) {
  const { t } = useLocale();
  if (props.profiles.length === 0) return null;

  return (
    <section className="footprints-section">
      <div className="feed-head">
        <h2>{t('recentTributes')}</h2>
      </div>
      <div className="footprints-strip">
        {props.profiles.map(group => {
          const fields = parseAnimalProfileNote(group.originalNote);
          const name =
            profileBareNameFromNote(group.originalNote) || 'Animal Friend';
          const root = group.burns.find(
            b =>
              b.burnTxid.toLowerCase() === group.originalBurnTxid.toLowerCase(),
          );
          const createdMs = root
            ? root.blockTimestamp
              ? root.blockTimestamp * 1000
              : new Date(root.timeFirstSeen).getTime()
            : new Date(group.at).getTime();
          return (
            <button
              key={group.originalBurnTxid}
              type="button"
              className="footprint-card"
              onClick={() => props.onOpenPet(group.originalBurnTxid)}
            >
              <span className="footprint-avatar">
                {speciesEmoji(fields?.species)}
              </span>
              <span className="footprint-name">{name}</span>
              <span className="footprint-time">{relativeTime(createdMs)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
