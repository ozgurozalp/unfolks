import type { FriendshipUser } from './instagram-utils';
import { getFriendshipUserId } from './instagram-utils';
import type { CheckpointSummary, ScanStopReason } from './shared-types';

export const CHECKPOINT_VERSION = 1;
/** A saved scan older than this is dropped; the lists will have changed. */
export const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;

/** How long Resume refuses to send anything after Instagram pushed back. */
export const SCAN_COOLDOWN_MS: Record<ScanStopReason, number> = {
  rate: 60 * 60 * 1000,
  blocked: 3 * 60 * 60 * 1000,
  gap: 3 * 60 * 60 * 1000,
  limited: 3 * 60 * 60 * 1000,
  auth: 0,
  // A short wait so repeated Resume clicks do not hammer a failing endpoint.
  error: 2 * 60 * 1000,
};

/**
 * Everything a stopped scan needs to continue where it left off. Follow-back
 * results are kept as two id lists: accounts confirmed to follow back, and
 * accounts confirmed not to. Anything in neither list is checked again.
 */
export interface ScanCheckpoint {
  version: typeof CHECKPOINT_VERSION;
  viewerId: string;
  savedAt: number;
  following: FriendshipUser[];
  /** Cursor of the next following page. Undefined before the first page. */
  followingCursor?: string;
  followingEmptyRun: number;
  followingDone: boolean;
  followingTotal: number | null;
  followersTotal: number | null;
  followBackIds: string[];
  notFollowBackIds: string[];
  /** The following list ended early, so some non-followers may be missing. */
  followingGap: boolean;
  cooldownUntil: number;
  stopReason?: ScanStopReason;
}

export function createCheckpoint(viewerId: string, now: number): ScanCheckpoint {
  return {
    version: CHECKPOINT_VERSION,
    viewerId,
    savedAt: now,
    following: [],
    followingEmptyRun: 0,
    followingDone: false,
    followingTotal: null,
    followersTotal: null,
    followBackIds: [],
    notFollowBackIds: [],
    followingGap: false,
    cooldownUntil: 0,
  };
}

/** Parse stored data defensively; anything malformed counts as no checkpoint. */
export function readCheckpoint(raw: unknown, viewerId: string, now: number): ScanCheckpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<ScanCheckpoint>;
  if (value.version !== CHECKPOINT_VERSION || value.viewerId !== viewerId) return null;
  if (typeof value.savedAt !== 'number' || now - value.savedAt > CHECKPOINT_TTL_MS) return null;
  if (
    !Array.isArray(value.following) ||
    !Array.isArray(value.followBackIds) ||
    !Array.isArray(value.notFollowBackIds)
  ) {
    return null;
  }
  return {
    ...createCheckpoint(viewerId, value.savedAt),
    ...value,
    version: CHECKPOINT_VERSION,
    viewerId,
  } as ScanCheckpoint;
}

/** Whether a checkpoint holds any progress worth resuming. */
export function hasProgress(checkpoint: ScanCheckpoint | null): boolean {
  return Boolean(checkpoint && (checkpoint.following.length > 0 || checkpoint.followingCursor));
}

export function summarizeCheckpoint(checkpoint: ScanCheckpoint): CheckpointSummary {
  return {
    viewerId: checkpoint.viewerId,
    savedAt: checkpoint.savedAt,
    loaded: checkpoint.following.length,
    total: checkpoint.followingTotal,
    cooldownUntil: checkpoint.cooldownUntil,
    ...(checkpoint.stopReason ? { stopReason: checkpoint.stopReason } : {}),
  };
}

/** An account unfollowed after the scan stopped must not come back on Resume. */
export function withoutAccount(checkpoint: ScanCheckpoint, userId: string): ScanCheckpoint {
  return {
    ...checkpoint,
    following: checkpoint.following.filter(user => getFriendshipUserId(user) !== userId),
  };
}

/** Mark the stop and when Resume may send requests again. */
export function markStopped(checkpoint: ScanCheckpoint, reason: ScanStopReason, now: number): ScanCheckpoint {
  const wait = SCAN_COOLDOWN_MS[reason];
  return {
    ...checkpoint,
    savedAt: now,
    stopReason: reason,
    cooldownUntil: wait > 0 ? now + wait : 0,
  };
}
