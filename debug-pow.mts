const BASE = 'https://test.onest.pet/api';
const installId = 'deb' + Array.from({ length: 29 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, json, text };
}

const feed = await fetch('https://test.onest.pet/index-api/api/feed?limit=1').then(r => r.json());
const postId = feed.posts[0].id;
console.log('post', postId);

const ch = await post('/challenge', { installId, kind: 'vote', postHash: postId, direction: 1 });
console.log('challenge', ch.status, JSON.stringify({ ok: ch.json?.ok, bits: ch.json?.bits, tokenId: ch.json?.tokenId, error: ch.json?.error }));

const ch2 = await post('/challenge', { installId, kind: 'vote', postHash: postId, direction: 1 });
console.log('challenge2', ch2.status, JSON.stringify({ ok: ch2.json?.ok, bits: ch2.json?.bits, error: ch2.json?.error, challengeId: ch2.json?.challengeId }));

const nonceHex = '00000000';
const sub = await post('/submit', { installId, challengeId: ch2.json.challengeId, nonceHex, powMs: 1, powAttempts: 1 });
console.log('submit', sub.status, sub.text.slice(0, 400));
