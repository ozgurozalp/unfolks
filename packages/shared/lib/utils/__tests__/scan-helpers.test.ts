import { describe, expect, it } from 'vitest';
import {
  classifyIgFailure,
  compactFriendshipUser,
  followersWalkLooksComplete,
  graphqlUnfollowOutcome,
  mapFollowingToUsers,
  MAX_EMPTY_PAGES,
  nextPageStep,
} from '../instagram-utils';
import {
  DEFAULT_UNFOLLOW_PACING,
  normalizeUnfollowPacing,
  resolveScanSpeed,
  shouldRestAfter,
  UNFOLLOW_PACING_LIMITS,
} from '../pacing';
import {
  CHECKPOINT_TTL_MS,
  createCheckpoint,
  hasProgress,
  markStopped,
  readCheckpoint,
  SCAN_COOLDOWN_MS,
  summarizeCheckpoint,
  withoutAccount,
} from '../scan-checkpoint';

describe('nextPageStep', () => {
  it('continues on a full page with a fresh cursor and resets the empty run', () => {
    expect(nextPageStep({ nextMaxId: 'b', pageLength: 20, prevMaxId: 'a', emptyRun: 3 })).toEqual({
      kind: 'continue',
      emptyRun: 0,
    });
  });

  it('steps over empty pages that still carry a fresh cursor', () => {
    expect(nextPageStep({ nextMaxId: 'b', pageLength: 0, prevMaxId: 'a', emptyRun: 0 })).toEqual({
      kind: 'continue',
      emptyRun: 1,
    });
  });

  it('gives up after too many empty pages in a row', () => {
    const step = nextPageStep({ nextMaxId: 'z', pageLength: 0, prevMaxId: 'y', emptyRun: MAX_EMPTY_PAGES });
    expect(step).toEqual({ kind: 'tooManyEmpty' });
  });

  it('ends the list when there is no cursor', () => {
    expect(nextPageStep({ nextMaxId: null, pageLength: 5, emptyRun: 0 })).toEqual({ kind: 'end' });
  });

  it('reports stuck when Instagram says there is more without a cursor', () => {
    expect(nextPageStep({ nextMaxId: '', pageLength: 5, emptyRun: 0, hasMore: true })).toEqual({ kind: 'stuck' });
  });

  it('reports stuck on a repeated cursor', () => {
    expect(nextPageStep({ nextMaxId: 'a', pageLength: 5, prevMaxId: 'a', emptyRun: 0 })).toEqual({ kind: 'stuck' });
  });
});

describe('followersWalkLooksComplete', () => {
  it('allows the small shortfall from unavailable accounts', () => {
    expect(followersWalkLooksComplete(98, 100)).toBe(true);
    expect(followersWalkLooksComplete(18, 20)).toBe(true);
  });

  it('rejects a list cut well short', () => {
    expect(followersWalkLooksComplete(50, 100)).toBe(false);
    expect(followersWalkLooksComplete(1, 200)).toBe(false);
  });

  it('trusts the walk when the follower count is unknown', () => {
    expect(followersWalkLooksComplete(5, null)).toBe(true);
  });
});

describe('classifyIgFailure', () => {
  it('treats a 401 asking to wait a few minutes as a rate limit, not a sign-out', () => {
    expect(
      classifyIgFailure(401, { require_login: true, message: 'Please wait a few minutes before you try again.' }),
    ).toBe('rate');
  });

  it('treats a plain 401 as a sign-out', () => {
    expect(classifyIgFailure(401, { require_login: true, message: 'login_required' })).toBe('auth');
  });

  it('treats 429 as a rate limit', () => {
    expect(classifyIgFailure(429, undefined)).toBe('rate');
  });

  it('treats checkpoints, spam and feedback_required as blocks', () => {
    expect(classifyIgFailure(400, { message: 'checkpoint_required' })).toBe('blocked');
    expect(classifyIgFailure(400, { spam: true })).toBe('blocked');
    expect(classifyIgFailure(200, { message: 'feedback_required', feedback_message: 'Try Again Later' })).toBe(
      'blocked',
    );
  });

  it('leaves other failures alone', () => {
    expect(classifyIgFailure(500, { message: 'oops' })).toBe('other');
  });
});

describe('graphqlUnfollowOutcome', () => {
  it('confirms when the mutation says the follow is gone', () => {
    const payload = { data: { xdt_destroy: { friendship_status: { following: false } } } };
    expect(graphqlUnfollowOutcome(payload)).toBe('confirmed');
  });

  it('is unconfirmed when Instagram only says ok', () => {
    expect(graphqlUnfollowOutcome({ data: { xdt_destroy: {} }, status: 'ok' })).toBe('unconfirmed');
  });

  it('fails on errors or when still following', () => {
    expect(graphqlUnfollowOutcome({ errors: [{ message: 'bad' }], data: {} })).toBe('failed');
    expect(graphqlUnfollowOutcome({ data: { x: { friendship_status: { following: true } } } })).toBe('failed');
    expect(graphqlUnfollowOutcome(null)).toBe('failed');
  });
});

describe('compactFriendshipUser', () => {
  it('keeps what a resumed scan needs and drops the rest', () => {
    const raw = {
      pk: 1,
      pk_id: '1',
      username: 'a',
      full_name: 'A',
      profile_pic_url: 'https://x/a.jpg',
      is_private: true,
      is_verified: false,
      has_anonymous_profile_picture: true,
      friendship_status: { following: true, followed_by: false },
      latest_reel_media: 123,
    };
    expect(compactFriendshipUser(raw)).toEqual({
      pk: 1,
      pk_id: '1',
      username: 'a',
      full_name: 'A',
      profile_pic_url: 'https://x/a.jpg',
      is_private: true,
      has_anonymous_profile_picture: true,
      friendship_status: { followed_by: false },
    });
  });
});

describe('mapFollowingToUsers avatar flag', () => {
  it('marks accounts with the default profile picture', () => {
    const [user] = mapFollowingToUsers([{ pk_id: '1', username: 'a', has_anonymous_profile_picture: true }], new Set());
    expect(user.hasNoAvatar).toBe(true);
  });
});

describe('unfollow pacing', () => {
  it('clamps values into safe bounds and keeps max at or above min', () => {
    const pacing = normalizeUnfollowPacing({ gapMinMs: 10, gapMaxMs: 5000, pauseEvery: -3, pauseMs: 1e12 });
    expect(pacing.gapMinMs).toBe(UNFOLLOW_PACING_LIMITS.gapMinMs.min);
    expect(pacing.pauseEvery).toBe(0);
    expect(pacing.pauseMs).toBe(UNFOLLOW_PACING_LIMITS.pauseMs.max);

    const swapped = normalizeUnfollowPacing({ gapMinMs: 9000, gapMaxMs: 3000 });
    expect(swapped.gapMaxMs).toBe(9000);
  });

  it('falls back to defaults for missing or invalid input', () => {
    expect(normalizeUnfollowPacing(undefined)).toEqual(DEFAULT_UNFOLLOW_PACING);
    expect(normalizeUnfollowPacing({ gapMinMs: Number.NaN })).toEqual(DEFAULT_UNFOLLOW_PACING);
  });

  it('rests after every N unfollows only when enabled', () => {
    const pacing = { ...DEFAULT_UNFOLLOW_PACING, pauseEvery: 5 };
    expect(shouldRestAfter(5, pacing)).toBe(true);
    expect(shouldRestAfter(4, pacing)).toBe(false);
    expect(shouldRestAfter(5, { ...pacing, pauseEvery: 0 })).toBe(false);
    expect(shouldRestAfter(5, { ...pacing, pauseMs: 0 })).toBe(false);
  });

  it('resolves unknown scan speeds to the default', () => {
    expect(resolveScanSpeed('careful')).toBe('careful');
    expect(resolveScanSpeed('warp')).toBe('fast');
  });
});

describe('scan checkpoint', () => {
  const now = 1_700_000_000_000;

  it('reads back a checkpoint for the same viewer within the TTL', () => {
    const saved = { ...createCheckpoint('42', now), following: [{ pk_id: '1', username: 'a' }] };
    expect(readCheckpoint(saved, '42', now + 1000)?.following).toHaveLength(1);
  });

  it('ignores checkpoints from another viewer, expired ones and malformed data', () => {
    const saved = createCheckpoint('42', now);
    expect(readCheckpoint(saved, '7', now)).toBeNull();
    expect(readCheckpoint(saved, '42', now + CHECKPOINT_TTL_MS + 1)).toBeNull();
    expect(readCheckpoint({ ...saved, following: 'x' }, '42', now)).toBeNull();
    expect(readCheckpoint('junk', '42', now)).toBeNull();
  });

  it('knows whether there is progress to resume', () => {
    const empty = createCheckpoint('42', now);
    expect(hasProgress(empty)).toBe(false);
    expect(hasProgress({ ...empty, followingCursor: 'c' })).toBe(true);
    expect(hasProgress(null)).toBe(false);
  });

  it('sets a cooldown that matches the stop reason', () => {
    const stopped = markStopped(createCheckpoint('42', now), 'rate', now);
    expect(stopped.cooldownUntil).toBe(now + SCAN_COOLDOWN_MS.rate);
    expect(markStopped(createCheckpoint('42', now), 'auth', now).cooldownUntil).toBe(0);
  });

  it('drops an unfollowed account and summarizes progress', () => {
    const saved = {
      ...createCheckpoint('42', now),
      following: [
        { pk_id: '1', username: 'a' },
        { pk_id: '2', username: 'b' },
      ],
      followingTotal: 10,
    };
    const next = withoutAccount(saved, '1');
    expect(next.following.map(user => user.username)).toEqual(['b']);
    expect(saved.following).toHaveLength(2);
    expect(summarizeCheckpoint(next)).toMatchObject({ viewerId: '42', loaded: 1, total: 10 });
  });
});
