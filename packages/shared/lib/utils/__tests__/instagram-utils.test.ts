import { describe, expect, it } from 'vitest';
import {
  computeUnfollowers,
  extractFollowBackIds,
  getFriendshipUserId,
  inlineFollowBackIds,
  isActionBlocked,
  isRetryableIgFail,
  mapInBatches,
  mapWithPool,
  mapFollowingToUsers,
  parseOptionalTimestamp,
  shouldAbortFollowersScan,
  shouldSkipFollowersScan,
  shouldStopPaging,
  usersMissingFollowedBy,
  type FriendshipUser,
} from '../instagram-utils';

describe('getFriendshipUserId', () => {
  it('prefers pk_id, then id, then pk', () => {
    expect(getFriendshipUserId({ pk_id: '1', id: '2', pk: 3, username: 'a' })).toBe('1');
    expect(getFriendshipUserId({ id: '2', pk: 3, username: 'a' })).toBe('2');
    expect(getFriendshipUserId({ pk: 3, username: 'a' })).toBe('3');
  });

  it('returns empty string when no identifier is present', () => {
    expect(getFriendshipUserId({ username: 'a' })).toBe('');
  });
});

describe('isActionBlocked', () => {
  it('detects explicit block flags', () => {
    expect(isActionBlocked(200, { feedback_required: true })).toBe(true);
    expect(isActionBlocked(200, { spam: true })).toBe(true);
  });

  it('detects block keywords in the message (case-insensitive)', () => {
    expect(isActionBlocked(400, { message: 'feedback_required' })).toBe(true);
    expect(isActionBlocked(400, { message: 'CHECKPOINT_REQUIRED' })).toBe(true);
    expect(isActionBlocked(400, { message: 'Please try again, this looks like spam' })).toBe(true);
  });

  it('treats HTTP 429 as blocked', () => {
    expect(isActionBlocked(429, {})).toBe(true);
  });

  it('returns false for normal responses', () => {
    expect(isActionBlocked(200, { status: 'ok' })).toBe(false);
    expect(isActionBlocked(400, { message: 'some other error' })).toBe(false);
  });
});

describe('isRetryableIgFail', () => {
  it('retries transient 200-fail bodies', () => {
    expect(isRetryableIgFail({ status: 'fail', message: 'Please try again' })).toBe(true);
    expect(isRetryableIgFail({ status: 'fail', message: 'rate limited' })).toBe(true);
    expect(isRetryableIgFail({ status: 'fail' })).toBe(true);
  });

  it('does not retry auth or spam bodies', () => {
    expect(isRetryableIgFail({ status: 'ok' })).toBe(false);
    expect(isRetryableIgFail({ status: 'fail', message: 'checkpoint_required' })).toBe(false);
    expect(isRetryableIgFail({ status: 'fail', message: 'Please login' })).toBe(false);
  });
});

describe('shouldStopPaging', () => {
  it('stops when there is no next cursor', () => {
    expect(shouldStopPaging(null, 10, 'abc')).toBe(true);
    expect(shouldStopPaging(undefined, 10, 'abc')).toBe(true);
  });

  it('stops on an empty page', () => {
    expect(shouldStopPaging('next', 0, 'abc')).toBe(true);
  });

  it('stops when the cursor did not advance (loop guard)', () => {
    expect(shouldStopPaging('abc', 10, 'abc')).toBe(true);
  });

  it('continues when there is a new cursor and users', () => {
    expect(shouldStopPaging('next', 10, 'abc')).toBe(false);
    expect(shouldStopPaging('next', 10, undefined)).toBe(false);
  });
});

describe('extractFollowBackIds', () => {
  it('returns follow-back ids when every user carries followed_by', () => {
    const users: FriendshipUser[] = [
      { pk_id: '1', username: 'a', friendship_status: { followed_by: true } },
      { pk_id: '2', username: 'b', friendship_status: { followed_by: false } },
      { pk_id: '3', username: 'c', friendship_status: { followed_by: true } },
    ];
    const ids = extractFollowBackIds(users);
    expect(ids).not.toBeNull();
    expect([...(ids as Set<string>)].sort()).toEqual(['1', '3']);
  });

  it('returns null when any user is missing followed_by', () => {
    const users: FriendshipUser[] = [
      { pk_id: '1', username: 'a', friendship_status: { followed_by: true } },
      { pk_id: '2', username: 'b' },
    ];
    expect(extractFollowBackIds(users)).toBeNull();
  });
});

describe('usersMissingFollowedBy', () => {
  it('keeps users that have an id but no followed_by flag', () => {
    const users: FriendshipUser[] = [
      { pk_id: '1', username: 'a', friendship_status: { followed_by: true } },
      { pk_id: '2', username: 'b' },
      { username: 'no-id' },
    ];
    expect(usersMissingFollowedBy(users).map(getFriendshipUserId)).toEqual(['2']);
  });
});

describe('inlineFollowBackIds', () => {
  it('walks followers when the list is cheaper than per-user lookups', () => {
    expect(shouldSkipFollowersScan(243, 235, 23)).toBe(false);
    expect(shouldSkipFollowersScan(5000, 500, 23)).toBe(false);
  });

  it('skips the followers walk when the viewer has far more followers than followings', () => {
    expect(shouldSkipFollowersScan(100_000, 200, 23)).toBe(true);
  });

  it('walks followers when the follower count is unknown', () => {
    expect(shouldSkipFollowersScan(null, 200, 23)).toBe(false);
  });

  it('keeps walking followers while pages confirm follow-backs', () => {
    expect(shouldAbortFollowersScan(1, 20, 5)).toBe(false);
    expect(shouldAbortFollowersScan(6, 1, 5)).toBe(false);
  });

  it('aborts the followers walk once pages outpace confirmations by the margin', () => {
    expect(shouldAbortFollowersScan(6, 0, 5)).toBe(true);
    expect(shouldAbortFollowersScan(12, 3, 5)).toBe(true);
  });

  it('collects only explicit followed_by true, even when the list is mixed', () => {
    const users: FriendshipUser[] = [
      { pk_id: '1', username: 'a', friendship_status: { followed_by: true } },
      { pk_id: '2', username: 'b' },
      { pk_id: '3', username: 'c', friendship_status: { followed_by: false } },
    ];
    expect([...inlineFollowBackIds(users)]).toEqual(['1']);
  });
});

describe('mapInBatches', () => {
  it('maps in parallel batches and pauses between them, not after the last', async () => {
    const seen: number[][] = [];
    const pauses: number[] = [];

    const result = await mapInBatches(
      [1, 2, 3, 4, 5],
      2,
      async n => {
        seen.push([n]);
        return n * 10;
      },
      {
        betweenBatches: async () => {
          pauses.push(seen.length);
        },
      },
    );

    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(pauses).toEqual([2, 4]);
  });

  it('returns an empty array for empty input', async () => {
    expect(await mapInBatches([], 3, async n => n)).toEqual([]);
  });
});

describe('mapWithPool', () => {
  it('preserves input order even when later items finish first', async () => {
    const result = await mapWithPool([1, 2, 3, 4, 5], 2, async n => {
      await new Promise(resolve => setTimeout(resolve, (6 - n) * 5));
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('returns an empty array for empty input', async () => {
    expect(await mapWithPool([], 8, async n => n)).toEqual([]);
  });
});

describe('parseOptionalTimestamp', () => {
  it('normalizes seconds, millis, and date strings', () => {
    expect(parseOptionalTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseOptionalTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseOptionalTimestamp('2020-01-01T00:00:00.000Z')).toBe(Date.parse('2020-01-01T00:00:00.000Z'));
  });

  it('returns undefined for empty values', () => {
    expect(parseOptionalTimestamp(undefined)).toBeUndefined();
    expect(parseOptionalTimestamp('')).toBeUndefined();
    expect(parseOptionalTimestamp('not-a-date')).toBeUndefined();
  });
});

describe('mapFollowingToUsers', () => {
  const following: FriendshipUser[] = [
    { pk_id: '1', username: 'alice', full_name: 'Alice', is_verified: true, is_private: false },
    { pk_id: '2', username: 'bob' },
    { username: 'no-id' }, // dropped: no id
    { pk_id: '4' } as FriendshipUser, // dropped: no username
  ];

  it('keeps the following-list index and optional account dates', () => {
    const dated: FriendshipUser[] = [
      { pk_id: '1', username: 'a', created_at: 1_700_000_000 },
      { username: 'skipped' },
      { pk_id: '2', username: 'b', created_at_utc: '1700000000000' },
    ];
    const [first, second] = mapFollowingToUsers(dated, new Set());
    expect(first).toMatchObject({ followIndex: 0, accountCreatedAt: 1_700_000_000_000 });
    expect(second).toMatchObject({ followIndex: 2, accountCreatedAt: 1_700_000_000_000 });
  });

  it('maps valid users and flags follow-back state', () => {
    const users = mapFollowingToUsers(following, new Set(['1']));
    expect(users).toHaveLength(2);

    const alice = users.find(u => u.id === '1');
    expect(alice).toMatchObject({
      id: '1',
      username: 'alice',
      full_name: 'Alice',
      isVerified: true,
      isPrivate: false,
      isFollowingMe: true,
      followIndex: 0,
    });

    const bob = users.find(u => u.id === '2');
    expect(bob).toMatchObject({ username: 'bob', full_name: '', isFollowingMe: false, followIndex: 1 });
  });
});

describe('computeUnfollowers', () => {
  it('returns only people who do not follow back', () => {
    const followings = [
      { id: '1', username: 'a', full_name: '', image: '', isFollowingMe: true, isPrivate: false, isVerified: false },
      { id: '2', username: 'b', full_name: '', image: '', isFollowingMe: false, isPrivate: false, isVerified: false },
    ];
    const result = computeUnfollowers(followings);
    expect(result.map(u => u.id)).toEqual(['2']);
  });
});
