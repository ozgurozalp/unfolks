import type { User } from '.';

export interface FriendshipStatus {
  following?: boolean;
  followed_by?: boolean;
}

export interface FriendshipUser {
  pk?: number | string;
  pk_id?: string;
  id?: string;
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  is_private?: boolean;
  is_verified?: boolean;
  friendship_status?: FriendshipStatus;
  created_at?: number | string;
  created_at_utc?: number | string;
}

export interface UnfollowResponse {
  status?: string;
  message?: string;
  feedback_required?: boolean;
  spam?: boolean;
  friendship_status?: { following?: boolean };
}

/** Resolve the most reliable identifier Instagram returns for a user. */
export function getFriendshipUserId(user: FriendshipUser): string {
  return String(user.pk_id ?? user.id ?? user.pk ?? '');
}

/** Integer in [min, max). */
export function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

/** Detect Instagram "soft block" signals (feedback_required / checkpoint / spam / 429). */
export function isActionBlocked(status: number, data: UnfollowResponse): boolean {
  if (data.feedback_required || data.spam) return true;
  const message = data.message?.toLowerCase() ?? '';
  if (message.includes('feedback_required') || message.includes('checkpoint_required') || message.includes('spam')) {
    return true;
  }
  return status === 429;
}

/**
 * Decide whether pagination should stop. Stops when there is no next cursor,
 * the page was empty, or the cursor did not advance (guards against loops).
 */
export function shouldStopPaging(
  nextMaxId: string | null | undefined,
  pageLength: number,
  prevMaxId?: string,
): boolean {
  return !nextMaxId || pageLength === 0 || nextMaxId === prevMaxId;
}

/**
 * When every user already carries a `followed_by` flag we can compute
 * follow-back ids without fetching the followers list. Returns null when the
 * data is incomplete and a followers fetch is required.
 */
export function extractFollowBackIds(users: FriendshipUser[]): Set<string> | null {
  if (!users.every(user => typeof user.friendship_status?.followed_by === 'boolean')) {
    return null;
  }

  return new Set(
    users
      .filter(user => user.friendship_status?.followed_by)
      .map(getFriendshipUserId)
      .filter(Boolean),
  );
}

/** Parse Instagram timestamps that may be seconds, millis, or date strings. */
export function parseOptionalTimestamp(value: unknown): number | undefined {
  // 0 / negative are treated as absent — valid IG account timestamps are post-2010.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber < 1e12 ? asNumber * 1000 : asNumber;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

/** Map raw Instagram friendship users to app `User`s, dropping malformed entries. */
export function mapFollowingToUsers(following: FriendshipUser[], followBackIds: Set<string>): User[] {
  return following.flatMap((user, index) => {
    const id = getFriendshipUserId(user);
    if (!id || !user.username) return [];

    const accountCreatedAt = parseOptionalTimestamp(user.created_at ?? user.created_at_utc);

    return [
      {
        id,
        username: user.username,
        full_name: user.full_name ?? '',
        image: user.profile_pic_url ?? '',
        isFollowingMe: followBackIds.has(id),
        isPrivate: Boolean(user.is_private),
        isVerified: Boolean(user.is_verified),
        followIndex: index,
        ...(accountCreatedAt === undefined ? {} : { accountCreatedAt }),
      },
    ];
  });
}

/** People you follow who do not follow you back. */
export function computeUnfollowers(followings: User[]): User[] {
  return followings.filter(following => !following.isFollowingMe);
}
