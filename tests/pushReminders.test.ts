import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  savePushSubscription,
  deletePushSubscription,
  vapidPublicKey,
} from '../apps/mint-api/src/pushReminders.js';

describe('pushReminders', () => {
  const storePath = resolve(process.cwd(), 'data/test-push-sub.json');
  const vapidPath = resolve(process.cwd(), 'data/test-vapid.json');

  beforeAll(() => {
    process.env.MINT_PUSH_STORE_PATH = storePath;
    process.env.MINT_VAPID_PATH = vapidPath;
  });

  afterAll(() => {
    delete process.env.MINT_PUSH_STORE_PATH;
    delete process.env.MINT_VAPID_PATH;
    try {
      rmSync(storePath, { force: true });
      rmSync(vapidPath, { force: true });
    } catch {
      // ignore
    }
  });

  it('generates a valid VAPID public key', () => {
    const key = vapidPublicKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(20);
  });

  it('saves and deletes push subscriptions', () => {
    const ep = 'https://push.example.com/sub/123';
    savePushSubscription({
      installId: 'test-install-12345',
      endpoint: ep,
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      locale: 'en',
      timeZone: 'UTC',
      profiles: [
        {
          txid: 'a'.repeat(64),
          name: 'Bella',
          passingYmd: '2023-05-12',
          kind: 'pet',
        },
      ],
    });

    // Should not throw and delete cleanly
    expect(() => deletePushSubscription(ep)).not.toThrow();
  });
});
