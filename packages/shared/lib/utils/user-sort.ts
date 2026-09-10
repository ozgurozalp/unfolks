import type { User } from './shared-types';

export const USER_SORT_KEYS = [
  'followed-desc',
  'followed-asc',
  'name-asc',
  'name-desc',
  'username-asc',
  'username-desc',
  'account-desc',
  'account-asc',
] as const;

export type UserSortKey = (typeof USER_SORT_KEYS)[number];

export const DEFAULT_USER_SORT: UserSortKey = 'followed-desc';

export const USER_SORT_GROUPS = [
  {
    id: 'followed',
    keys: ['followed-desc', 'followed-asc'],
  },
  {
    id: 'name',
    keys: ['name-asc', 'name-desc'],
  },
  {
    id: 'username',
    keys: ['username-asc', 'username-desc'],
  },
  {
    id: 'account',
    keys: ['account-desc', 'account-asc'],
  },
] as const;

export function isUserSortKey(value: unknown): value is UserSortKey {
  return typeof value === 'string' && (USER_SORT_KEYS as readonly string[]).includes(value);
}

export function resolveUserSortKey(value: unknown): UserSortKey {
  return isUserSortKey(value) ? value : DEFAULT_USER_SORT;
}

/** Display name for alphabetical sort; falls back to username when empty. */
export function userNameKey(user: User): string {
  return (user.full_name ?? '').trim() || user.username;
}

function compareText(a: string, b: string, locale?: string): number {
  return a.localeCompare(b, locale, { sensitivity: 'base', numeric: true });
}

function compareBigIntId(a: string, b: string): number {
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) return 0;
    return left < right ? -1 : 1;
  } catch {
    return a.localeCompare(b);
  }
}

function compareAccountAge(a: User, b: User): number {
  const aCreated = a.accountCreatedAt;
  const bCreated = b.accountCreatedAt;
  if (typeof aCreated === 'number' && typeof bCreated === 'number' && aCreated !== bCreated) {
    return aCreated - bCreated;
  }
  return compareBigIntId(a.id, b.id);
}

function followRank(user: User, index: number): number {
  return typeof user.followIndex === 'number' ? user.followIndex : index;
}

/**
 * Sort users without mutating the input. `followed-*` uses Instagram following
 * order (`followIndex`, else current array position). `account-*` uses
 * `accountCreatedAt` when both sides have it, otherwise numeric user id.
 */
export function sortUsers(users: User[], sortKey: UserSortKey, locale?: string): User[] {
  const key = resolveUserSortKey(sortKey);

  return users
    .map((user, index) => ({ user, index }))
    .sort((left, right) => {
      const a = left.user;
      const b = right.user;
      let result = 0;

      switch (key) {
        case 'followed-desc':
          result = followRank(a, left.index) - followRank(b, right.index);
          break;
        case 'followed-asc':
          result = followRank(b, right.index) - followRank(a, left.index);
          break;
        case 'name-asc':
          result = compareText(userNameKey(a), userNameKey(b), locale);
          break;
        case 'name-desc':
          result = compareText(userNameKey(b), userNameKey(a), locale);
          break;
        case 'username-asc':
          result = compareText(a.username, b.username, locale);
          break;
        case 'username-desc':
          result = compareText(b.username, a.username, locale);
          break;
        case 'account-asc':
          result = compareAccountAge(a, b);
          break;
        case 'account-desc':
          result = compareAccountAge(b, a);
          break;
      }

      if (result !== 0) return result;
      return left.index - right.index;
    })
    .map(entry => entry.user);
}
