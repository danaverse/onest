/**
 * Open Graph / social preview HTML for animal profile and tribute share URLs.
 */
import {
  profileDisplayName,
  parseAnimalProfileNote,
} from '../../../src/offering/animalProfileFields.js';

export type OgLocale = 'en' | 'vi' | 'zh';

export const OG_IMAGE_PATH = '/images/og.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export function ogImagePath(locale: OgLocale): string {
  switch (locale) {
    case 'vi':
      return '/images/og-vi.png';
    case 'zh':
      return '/images/og-zh.png';
    default:
      return OG_IMAGE_PATH;
  }
}

export function ogImageAlt(locale: OgLocale): string {
  switch (locale) {
    case 'vi':
      return 'Onest — dấu chân tưởng nhớ';
    case 'zh':
      return 'Onest — 每一枚爪印，都是爱的故事';
    default:
      return 'Onest — paw-print animal memories';
  }
}

export function parseOgLocale(raw: string | null | undefined): OgLocale | null {
  if (!raw) return null;
  const primary = raw.trim().toLowerCase().split(/[,;]/)[0]?.trim() ?? '';
  if (primary.startsWith('vi')) return 'vi';
  if (primary.startsWith('zh')) return 'zh';
  if (primary.startsWith('en')) return 'en';
  return null;
}

export function resolveOgLocale(opts: {
  langParam?: string | null;
  acceptLanguage?: string | null;
}): OgLocale {
  return parseOgLocale(opts.langParam) || 'en';
}

export function ogCopy(
  locale: OgLocale,
  name: string,
): { title: string; description: string } {
  const n = name.trim();
  if (n) {
    switch (locale) {
      case 'vi':
        return {
          title: `Tưởng nhớ ${n}`,
          description: 'Dấu chân tưởng nhớ thú cưng yêu quý — ghi dấu vĩnh cửu.',
        };
      case 'zh':
        return {
          title: `怀念 ${n}`,
          description: '每一枚爪印，都是爱的故事。',
        };
      default:
        return {
          title: `In memory of ${n}`,
          description: 'A loving paw-print tribute — recorded forever.',
        };
    }
  }
  switch (locale) {
    case 'vi':
      return {
        title: 'Onest — Theo dấu chân thương',
        description: 'Lưu giữ ký ức thú cưng và in dấu chân vĩnh cửu.',
      };
    case 'zh':
      return {
        title: 'Onest — 每一枚爪印，都是爱的故事',
        description: '循着爪印，皆是深爱。',
      };
    default:
      return {
        title: 'Onest — Loving Animal Memories',
        description: 'Every paw print, a story of love.',
      };
  }
}

export function buildOgHtml(opts: {
  burnTxid: string;
  note: string;
  siteOrigin: string;
  locale?: OgLocale;
}): string {
  const loc = opts.locale || 'en';
  const parsed = parseAnimalProfileNote(opts.note);
  const name = parsed ? profileDisplayName(parsed) : opts.note;
  const copy = ogCopy(loc, name);
  const imgUrl = `${opts.siteOrigin}${ogImagePath(loc)}`;
  const canonicalUrl = `${opts.siteOrigin}/${opts.burnTxid.toLowerCase()}`;

  return `<!doctype html>
<html lang="${loc}">
<head>
  <meta charset="utf-8" />
  <title>${copy.title}</title>
  <meta name="description" content="${copy.description}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Onest" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:title" content="${copy.title}" />
  <meta property="og:description" content="${copy.description}" />
  <meta property="og:image" content="${imgUrl}" />
  <meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />
  <meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />
  <meta property="og:image:alt" content="${ogImageAlt(loc)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${copy.title}" />
  <meta name="twitter:description" content="${copy.description}" />
  <meta name="twitter:image" content="${imgUrl}" />
  <meta http-equiv="refresh" content="0; url=${canonicalUrl}" />
</head>
<body>
  <p><a href="${canonicalUrl}">${copy.title}</a></p>
</body>
</html>`;
}
