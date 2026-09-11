import {
  memorialPushdata,
  memorialPushdataWithCreator,
  OFFERING_ID_PAW,
} from '../src/offering/danaMemorial.js';
import {
  encodePostStampPushdata,
  encodeVotePushdata,
  parsePostStampPushdata,
  parseVotePushdata,
  normalizeVoteDirection,
  DANA_VERSION_POST,
  DANA_VERSION_VOTE,
  POST_STAMP_PAYLOAD_LEN,
  VOTE_DIRECTION_DOWN,
  VOTE_DIRECTION_UP,
  VOTE_PAYLOAD_LEN,
  VOTE_TARGET_TYPE_POST,
} from '../src/social/danaSocial.js';
import {
  classifyDanaPush,
  danaPushFromEmppPushes,
} from '../src/social/danaClassify.js';

const POST_HASH = 'ab'.repeat(32);

describe('DANA v3 vote payload', () => {
  it('roundtrips direction, target type and post hash', () => {
    const data = encodeVotePushdata({
      direction: VOTE_DIRECTION_UP,
      postHash: POST_HASH,
    });
    expect(data.length).toBe(VOTE_PAYLOAD_LEN);
    expect(String.fromCharCode(...data.slice(0, 4))).toBe('DANA');

    const parsed = parseVotePushdata(data);
    expect(parsed.version).toBe(DANA_VERSION_VOTE);
    expect(parsed.direction).toBe(VOTE_DIRECTION_UP);
    expect(parsed.targetType).toBe(VOTE_TARGET_TYPE_POST);
    expect(parsed.postHash).toBe(POST_HASH);
  });

  it('supports down votes and custom target types', () => {
    const data = encodeVotePushdata({
      direction: VOTE_DIRECTION_DOWN,
      postHash: 'CD'.repeat(32),
      targetType: 0x0001,
    });
    const parsed = parseVotePushdata(data);
    expect(parsed.direction).toBe(VOTE_DIRECTION_DOWN);
    expect(parsed.targetType).toBe(0x0001);
    expect(parsed.postHash).toBe('cd'.repeat(32));
  });

  it('rejects malformed hashes and directions', () => {
    expect(() => encodeVotePushdata({ direction: 1, postHash: 'nope' })).toThrow();
    const data = encodeVotePushdata({ direction: VOTE_DIRECTION_UP, postHash: POST_HASH });
    const bad = Uint8Array.from(data);
    bad[5] = 7;
    expect(() => parseVotePushdata(bad)).toThrow(/direction/i);
    expect(() => parseVotePushdata(data.slice(0, 20))).toThrow(/truncated/i);
  });

  it('normalizes friendly direction input', () => {
    expect(normalizeVoteDirection('up')).toBe(VOTE_DIRECTION_UP);
    expect(normalizeVoteDirection(0)).toBe(VOTE_DIRECTION_DOWN);
    expect(normalizeVoteDirection('sideways')).toBeNull();
  });
});

describe('DANA v4 post stamp', () => {
  it('roundtrips the content hash', () => {
    const data = encodePostStampPushdata(POST_HASH.toUpperCase());
    expect(data.length).toBe(POST_STAMP_PAYLOAD_LEN);

    const parsed = parsePostStampPushdata(data);
    expect(parsed.version).toBe(DANA_VERSION_POST);
    expect(parsed.contentHash).toBe(POST_HASH);
  });

  it('rejects non-hash input', () => {
    expect(() => encodePostStampPushdata('xyz')).toThrow();
  });
});

describe('DANA classifier', () => {
  it('routes memorial v1/v2, vote v3 and post v4', () => {
    const memorial = classifyDanaPush(memorialPushdata('Bella', OFFERING_ID_PAW));
    expect(memorial?.kind).toBe('memorial');

    const parented = classifyDanaPush(
      memorialPushdata('Tribute', OFFERING_ID_PAW, POST_HASH),
    );
    expect(parented?.kind).toBe('memorial');

    const withCreator = classifyDanaPush(
      memorialPushdataWithCreator('Luna', 'cd'.repeat(20), OFFERING_ID_PAW),
    );
    expect(withCreator?.kind).toBe('memorial');
    if (withCreator?.kind === 'memorial') {
      expect(withCreator.memorial.creatorHash160).toBe('cd'.repeat(20));
    }

    const vote = classifyDanaPush(
      encodeVotePushdata({ direction: VOTE_DIRECTION_UP, postHash: POST_HASH }),
    );
    expect(vote?.kind).toBe('vote');

    const post = classifyDanaPush(encodePostStampPushdata(POST_HASH));
    expect(post?.kind).toBe('post');
  });

  it('ignores non-DANA and unknown versions', () => {
    expect(classifyDanaPush(new TextEncoder().encode('SOME other payload'))).toBeNull();
    const unknown = new Uint8Array([0x44, 0x41, 0x4e, 0x41, 9, 0, 0, 0]);
    expect(classifyDanaPush(unknown)).toBeNull();
    expect(danaPushFromEmppPushes([unknown])).toBeNull();
  });
});
