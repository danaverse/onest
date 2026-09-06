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
      return 'Onest — 宠物纪念印记';
    default:
      return 'Onest — paw-print animal memorial';
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
          description: 'Dấu chân tưởng nhớ thú cưng yêu quý — ghi mãi trên chuỗi eCash.',
        };
      case 'zh':
        return {
          title: `纪念 ${n}`,
          description: '献给挚爱宠物的爪印纪念——永远镌刻于 eCash 链上。',
        };
      default:
        return {
          title: `In memory of ${n}`,
          description: 'A loving paw-print tribute — recorded forever on eCash.',
        };
    }
  }
  switch (locale) {
    case 'vi':
      return {
        title: 'Onest — Kết nối yêu thương',
        description: 'Tưởng nhớ thú cưng và lưu giữ dấu chân vĩnh cửu trên eCash.',
      };
    case 'zh':
      return {
        title: 'Onest — 跨越彩虹桥的永恒思念',
        description: '为挚爱宠物点亮永恒的爪印纪念。',
      };
    default:
      return {
        title: 'Onest — Loving Pet Memorials',
        description: 'Paw-print animal profile tributes recorded forever on eCash.',
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
