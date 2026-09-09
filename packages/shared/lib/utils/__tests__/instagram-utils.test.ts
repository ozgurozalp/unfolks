import { describe, expect, it } from 'vitest';
import {
  computeUnfollowers,
  extractFollowBackIds,
  getFriendshipUserId,
  isActionBlocked,
  mapFollowingToUsers,
  shouldStopPaging,
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

describe('mapFollowingToUsers', () => {
  const following: FriendshipUser[] = [
    { pk_id: '1', username: 'alice', full_name: 'Alice', is_verified: true, is_private: false },
    { pk_id: '2', username: 'bob' },
    { username: 'no-id' }, // dropped: no id
    { pk_id: '4' } as FriendshipUser, // dropped: no username
  ];

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
    });

    const bob = users.find(u => u.id === '2');
    expect(bob).toMatchObject({ username: 'bob', full_name: '', isFollowingMe: false });
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
