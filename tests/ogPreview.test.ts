import { encodeAnimalProfileNote } from '../src/offering/animalProfileFields.js';
import {
  OG_IMAGE_PATH,
  buildOgHtml,
  ogCopy,
  ogImageAlt,
  ogImagePath,
  resolveOgLocale,
} from '../apps/dana-index/src/ogPreview.js';

const TX = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('ogPreview', () => {
  it('resolves locale properly', () => {
    expect(resolveOgLocale({})).toBe('en');
    expect(resolveOgLocale({ langParam: 'en' })).toBe('en');
    expect(resolveOgLocale({ langParam: 'vi' })).toBe('vi');
    expect(resolveOgLocale({ langParam: 'zh' })).toBe('zh');
  });

  it('builds animal memory title and description', () => {
    expect(ogCopy('en', 'Milo').title).toBe('In memory of Milo');
    expect(ogCopy('en', 'Milo').description).toBe('A loving paw-print tribute — recorded forever.');
    expect(ogCopy('vi', 'Milo').title).toBe('Tưởng nhớ Milo');
    expect(ogCopy('vi', 'Milo').description).toBe('Dấu chân tưởng nhớ thú cưng yêu quý — ghi dấu vĩnh cửu.');
    expect(ogCopy('zh', 'Milo').title).toBe('怀念 Milo');
    expect(ogCopy('zh', 'Milo').description).toBe('每一枚爪印，都是爱的故事。');
  });

  it('provides default copy when name is empty', () => {
    expect(ogCopy('en', '').title).toBe('Onest — Loving Animal Memories');
    expect(ogCopy('en', '').description).toBe('Every paw print, a story of love.');
    expect(ogCopy('vi', '').title).toBe('Onest — Theo dấu chân thương');
    expect(ogCopy('vi', '').description).toBe('Lưu giữ ký ức thú cưng và in dấu chân vĩnh cửu.');
    expect(ogCopy('zh', '').title).toBe('Onest — 每一枚爪印，都是爱的故事');
    expect(ogCopy('zh', '').description).toBe('循着爪印，皆是深爱。');
  });

  it('builds complete HTML document with OG meta tags', () => {
    const note = encodeAnimalProfileNote({
      species: 'cat',
      name: 'Oliver',
      note: 'Sweetest orange boy',
      breed: 'Tabby',
      birthDate: '2018',
      passingDate: '2025',
      location: '',
      memorialPlace: '',
      relationshipType: '',
      relatedTxid: '',
      relationships: [],
      kind: 'memorial',
      dateCalendar: 'solar',
    });

    const html = buildOgHtml({
      burnTxid: TX,
      note,
      siteOrigin: 'https://onest.pet',
      locale: 'en',
    });

    expect(html).toContain('<title>In memory of Oliver</title>');
    expect(html).toContain('property="og:title" content="In memory of Oliver"');
    expect(html).toContain('property="og:url" content="https://onest.pet/' + TX + '"');
    expect(html).toContain('property="og:image" content="https://onest.pet/images/og.png"');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://onest.pet/' + TX + '"');
  });
});
