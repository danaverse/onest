import {
  normalizeShareLang,
  profileShareUrl,
} from '../apps/web/src/lib/shareLink.js';

const TX = 'ab'.repeat(32);

describe('shareLink', () => {
  it('normalizes share languages', () => {
    expect(normalizeShareLang('vi')).toBe('vi');
    expect(normalizeShareLang('VI-VN')).toBe('vi');
    expect(normalizeShareLang('zh-Hans')).toBe('zh');
    expect(normalizeShareLang('en-US,en;q=0.9')).toBe('en');
    expect(normalizeShareLang('fr')).toBeNull();
    expect(normalizeShareLang('')).toBeNull();
    expect(normalizeShareLang(null)).toBeNull();
  });

  it('builds profile share URLs with the sender language', () => {
    expect(profileShareUrl(TX, 'https://onest.pet', 'vi')).toBe(
      `https://onest.pet/${TX}?lang=vi`,
    );
    expect(profileShareUrl(TX.toUpperCase(), 'https://onest.pet/', 'zh')).toBe(
      `https://onest.pet/${TX}?lang=zh`,
    );
    /* Unknown languages and missing locale produce a plain link. */
    expect(profileShareUrl(TX, 'https://onest.pet', 'fr')).toBe(
      `https://onest.pet/${TX}`,
    );
    expect(profileShareUrl(TX, 'https://onest.pet')).toBe(
      `https://onest.pet/${TX}`,
    );
  });

  it('rejects invalid burn txids', () => {
    expect(() => profileShareUrl('nope', 'https://onest.pet', 'en')).toThrow(
      /invalid burn txid/,
    );
  });
});
