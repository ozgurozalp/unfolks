import type { InstagramViewer, User } from './shared-types';

/**
 * Accounts in a fresh scan that were not in the list the viewer last saw.
 * Compares ids, not counts: accounts the viewer unfollowed in between cannot
 * reappear, so they do not hide someone who unfollowed in the meantime.
 */
export function findNewUnfollowers(previous: readonly User[] | null, next: readonly User[]): User[] {
  if (!previous) return [];
  const known = new Set(previous.map(user => user.id));
  return next.filter(user => !known.has(user.id));
}

/** Drop per-session UI flags so a reopened panel never shows a stuck spinner. */
export function withoutTransientState(users: readonly User[]): User[] {
  return users.map(user => {
    const copy = { ...user };
    delete copy.unFollowLoading;
    return copy;
  });
}

export type ViewerIdentity = Pick<InstagramViewer, 'id' | 'username'>;

/** Same Instagram account. Ids survive renames; usernames are the fallback. */
export function isSameViewer(a: ViewerIdentity, b: ViewerIdentity): boolean {
  if (a.id && b.id) return a.id === b.id;
  return a.username === b.username;
}
