import { describe, expect, it } from 'vitest';
import type { InstagramViewer, User } from '../shared-types';
import { findNewUnfollowers, isSameViewer, withoutTransientState } from '../user-list';

function user(id: string, extra: Partial<User> = {}): User {
  return {
    id,
    username: `user${id}`,
    full_name: '',
    image: '',
    isFollowingMe: false,
    isPrivate: false,
    isVerified: false,
    ...extra,
  };
}

function viewer(id: string, username: string): InstagramViewer {
  return { id, username } as InstagramViewer;
}

describe('findNewUnfollowers', () => {
  it('returns nothing on the first scan', () => {
    expect(findNewUnfollowers(null, [user('1')])).toEqual([]);
  });

  it('returns accounts that were not in the previous list', () => {
    const result = findNewUnfollowers([user('1'), user('2')], [user('2'), user('3')]);
    expect(result.map(u => u.id)).toEqual(['3']);
  });

  it('counts a new unfollower even when the list got shorter', () => {
    // Last scan showed 3; the viewer unfollowed two of them, then one new person unfollowed.
    const previous = [user('1')];
    const next = [user('1'), user('4')];
    expect(findNewUnfollowers(previous, next).map(u => u.id)).toEqual(['4']);
  });
});

describe('withoutTransientState', () => {
  it('drops the unfollow spinner flag without touching the input', () => {
    const input = [user('1', { unFollowLoading: true }), user('2')];
    const result = withoutTransientState(input);
    expect(result[0]).not.toHaveProperty('unFollowLoading');
    expect(result[1]).toEqual(user('2'));
    expect(input[0].unFollowLoading).toBe(true);
  });
});

describe('isSameViewer', () => {
  it('compares by id when both sides have one', () => {
    expect(isSameViewer(viewer('1', 'old-name'), viewer('1', 'new-name'))).toBe(true);
    expect(isSameViewer(viewer('1', 'same'), viewer('2', 'same'))).toBe(false);
  });

  it('falls back to username when an id is missing', () => {
    expect(isSameViewer(viewer('', 'ada'), viewer('2', 'ada'))).toBe(true);
    expect(isSameViewer(viewer('', 'ada'), viewer('2', 'mia'))).toBe(false);
  });
});
