import { describe, expect, it } from 'vitest';
import type { User } from '../shared-types';
import { DEFAULT_USER_SORT, isUserSortKey, resolveUserSortKey, sortUsers, userNameKey } from '../user-sort';

function user(partial: Partial<User> & Pick<User, 'id' | 'username'>): User {
  return {
    full_name: '',
    image: '',
    isFollowingMe: false,
    isPrivate: false,
    isVerified: false,
    ...partial,
  };
}

describe('isUserSortKey / resolveUserSortKey', () => {
  it('accepts known keys and falls back to recently followed', () => {
    expect(isUserSortKey('name-asc')).toBe(true);
    expect(isUserSortKey('nope')).toBe(false);
    expect(resolveUserSortKey('username-desc')).toBe('username-desc');
    expect(resolveUserSortKey('legacy')).toBe(DEFAULT_USER_SORT);
  });
});

describe('userNameKey', () => {
  it('uses the display name, then username', () => {
    expect(userNameKey(user({ id: '1', username: 'bob', full_name: 'Ada' }))).toBe('Ada');
    expect(userNameKey(user({ id: '1', username: 'bob', full_name: '  ' }))).toBe('bob');
  });
});

describe('sortUsers', () => {
  const users = [
    user({ id: '10', username: 'zeta', full_name: 'Zara', followIndex: 0 }),
    user({ id: '2', username: 'ada', full_name: 'Ada', followIndex: 1 }),
    user({ id: '30', username: 'mia', full_name: '', followIndex: 2 }),
  ];

  it('does not mutate the input', () => {
    const copy = [...users];
    sortUsers(users, 'name-asc');
    expect(users).toEqual(copy);
  });

  it('sorts by follow recency (API order)', () => {
    expect(sortUsers(users, 'followed-desc').map(u => u.id)).toEqual(['10', '2', '30']);
    expect(sortUsers(users, 'followed-asc').map(u => u.id)).toEqual(['30', '2', '10']);
  });

  it('falls back to array position when followIndex is missing', () => {
    const unsaved = [user({ id: 'a', username: 'a' }), user({ id: 'b', username: 'b' })];
    expect(sortUsers(unsaved, 'followed-desc').map(u => u.id)).toEqual(['a', 'b']);
    expect(sortUsers(unsaved, 'followed-asc').map(u => u.id)).toEqual(['b', 'a']);
  });

  it('sorts by display name, using username when the name is empty', () => {
    expect(sortUsers(users, 'name-asc').map(u => u.username)).toEqual(['ada', 'mia', 'zeta']);
    expect(sortUsers(users, 'name-desc').map(u => u.username)).toEqual(['zeta', 'mia', 'ada']);
  });

  it('sorts by username', () => {
    expect(sortUsers(users, 'username-asc').map(u => u.username)).toEqual(['ada', 'mia', 'zeta']);
    expect(sortUsers(users, 'username-desc').map(u => u.username)).toEqual(['zeta', 'mia', 'ada']);
  });

  it('sorts by account age using numeric id', () => {
    expect(sortUsers(users, 'account-asc').map(u => u.id)).toEqual(['2', '10', '30']);
    expect(sortUsers(users, 'account-desc').map(u => u.id)).toEqual(['30', '10', '2']);
  });

  it('prefers accountCreatedAt when both sides have it', () => {
    const dated = [
      user({ id: '99', username: 'new-id-old-account', accountCreatedAt: 1 }),
      user({ id: '1', username: 'old-id-new-account', accountCreatedAt: 9 }),
    ];
    expect(sortUsers(dated, 'account-asc').map(u => u.username)).toEqual(['new-id-old-account', 'old-id-new-account']);
  });

  it('keeps equal keys in the original order', () => {
    const tied = [
      user({ id: '1', username: 'same', full_name: 'Same' }),
      user({ id: '2', username: 'same', full_name: 'Same' }),
    ];
    expect(sortUsers(tied, 'username-asc').map(u => u.id)).toEqual(['1', '2']);
  });
});
