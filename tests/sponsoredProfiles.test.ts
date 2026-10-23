import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hasSponsoredProfile,
  rememberSponsoredProfile,
} from '../apps/mint-api/src/sponsoredProfiles.js';

describe('sponsoredProfiles', () => {
  const testPath = resolve(process.cwd(), 'data/test-sponsored-profiles.json');
  const previous = process.env.MINT_SPONSORED_PROFILES_PATH;

  beforeEach(() => {
    process.env.MINT_SPONSORED_PROFILES_PATH = testPath;
  });

  afterEach(() => {
    try {
      rmSync(testPath, { force: true });
    } catch {
      /* ignore */
    }
    if (previous === undefined) delete process.env.MINT_SPONSORED_PROFILES_PATH;
    else process.env.MINT_SPONSORED_PROFILES_PATH = previous;
  });

  it('allows exactly one sponsored profile per install', () => {
    expect(hasSponsoredProfile('install-a')).toBe(false);
    rememberSponsoredProfile('install-a');
    expect(hasSponsoredProfile('install-a')).toBe(true);
    expect(hasSponsoredProfile('install-b')).toBe(false);
    /* Idempotent: a second remember does not change anything. */
    rememberSponsoredProfile('install-a');
    expect(hasSponsoredProfile('install-a')).toBe(true);
    expect(hasSponsoredProfile('')).toBe(false);
  });
});
