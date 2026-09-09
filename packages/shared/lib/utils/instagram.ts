import type { InstagramSharedData, ScanProgress, User } from '.';
import { t } from '@extension/i18n';
import {
  computeUnfollowers,
  extractFollowBackIds,
  getFriendshipUserId,
  isActionBlocked,
  mapFollowingToUsers,
  randomBetween,
  shouldStopPaging,
  type FriendshipUser,
  type UnfollowResponse,
} from './instagram-utils';

const IG_WEB_APP_ID = '936619743392459';
const FRIENDSHIP_PAGE_SIZE = 200;
const SCAN_DELAY_MIN_MS = 700;
const SCAN_DELAY_MAX_MS = 1500;
const SCAN_PAUSE_EVERY_PAGES = 5;
const SCAN_PAUSE_MS = 8000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 2000;
/** Local cooldown enforced after Instagram soft-blocks an action. */
export const ACTION_BLOCK_COOLDOWN_MS = 15 * 60 * 1000;

type ProgressCallback = (progress: ScanProgress) => void;

interface FriendshipsPage {
  users?: FriendshipUser[];
  next_max_id?: string | null;
  status?: string;
  message?: string;
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class ActionBlockedError extends Error {
  cooldownMs: number;
  constructor(message: string, cooldownMs = ACTION_BLOCK_COOLDOWN_MS) {
    super(message);
    this.name = 'ActionBlockedError';
    this.cooldownMs = cooldownMs;
  }
}

export class Instagram {
  sharedData: InstagramSharedData;
  followings: User[] = [];

  constructor(sharedData: InstagramSharedData) {
    this.sharedData = sharedData;
  }

  async getPeople(onProgress?: ProgressCallback) {
    this.clearStorage();
    await this.getFollowing(onProgress);
    return this.getUnFollowers();
  }

  async unFollow(user: User) {
    const paths = [`/api/v1/web/friendships/${user.id}/unfollow/`, `/web/friendships/${user.id}/unfollow/`];
    let blocked = false;

    for (const path of paths) {
      const response = await this.postForm(path, { user_id: user.id, container_module: 'profile' });

      let data: UnfollowResponse = {};
      try {
        data = (await response.json()) as UnfollowResponse;
      } catch {
        // Some endpoints return an empty/non-JSON body on success.
      }

      if (data.status === 'ok' || data.friendship_status?.following === false) {
        return { status: true, deletedId: user.id };
      }

      if (isActionBlocked(response.status, data)) {
        blocked = true;
        break;
      }
    }

    if (blocked) throw new ActionBlockedError(t('actionBlocked'));
    throw new Error('Unfollow failed');
  }

  async getFollowing(onProgress?: ProgressCallback): Promise<void> {
    const counts = await this.getProfileCounts();
    const total = (counts.following ?? 0) + (counts.followers ?? 0);

    const following = await this.fetchFriendshipUsers('following', loaded =>
      onProgress?.({ phase: 'following', current: loaded, total }),
    );

    if (following.length === 0) {
      if (counts.following && counts.following > 0) {
        throw new Error('Following list could not be loaded');
      }
      this.followings = [];
      return;
    }

    const followBackIds = await this.getFollowBackIds(following, following.length, total, onProgress);

    this.followings = mapFollowingToUsers(following, followBackIds);
  }

  getUnFollowers() {
    return computeUnfollowers(this.followings);
  }

  clearStorage() {
    this.followings = [];
  }

  private async postForm(path: string, fields: Record<string, string>) {
    const response = await fetch(path, {
      headers: {
        ...this.igHeaders(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      body: new URLSearchParams(fields),
    });

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(t('authError'));
    }

    return response;
  }

  private igHeaders() {
    return {
      'x-ig-app-id': IG_WEB_APP_ID,
      'x-csrftoken': document.cookie.match(/(?:^|; )csrftoken=([^;]*)/)?.[1] || this.sharedData.config.csrf_token,
      'x-requested-with': 'XMLHttpRequest',
      'x-instagram-ajax': '1',
    };
  }

  private async getFollowBackIds(
    users: FriendshipUser[],
    followingCount: number,
    total: number,
    onProgress?: ProgressCallback,
  ): Promise<Set<string>> {
    const inlineFollowBackIds = extractFollowBackIds(users);
    if (inlineFollowBackIds) {
      onProgress?.({ phase: 'followers', current: total, total });
      return inlineFollowBackIds;
    }

    const followers = await this.fetchFriendshipUsers('followers', loaded =>
      onProgress?.({ phase: 'followers', current: followingCount + loaded, total }),
    );
    return new Set(followers.map(getFriendshipUserId).filter(Boolean));
  }

  private async fetchFriendshipUsers(
    list: 'following' | 'followers',
    onPage?: (loaded: number) => void,
  ): Promise<FriendshipUser[]> {
    const userId = this.sharedData.config.viewerId;
    const all: FriendshipUser[] = [];
    let maxId: string | undefined;
    let page = 0;

    for (;;) {
      const url = new URL(`https://www.instagram.com/api/v1/friendships/${userId}/${list}/`);
      url.searchParams.set('count', String(FRIENDSHIP_PAGE_SIZE));
      url.searchParams.set('search_surface', 'follow_list_page');
      if (maxId) url.searchParams.set('max_id', maxId);

      const data = await this.igGet(url.toString(), list);
      const users = data.users ?? [];
      all.push(...users);
      onPage?.(all.length);
      page += 1;

      const nextMaxId = data.next_max_id;
      if (shouldStopPaging(nextMaxId, users.length, maxId)) break;
      maxId = nextMaxId as string;

      if (SCAN_PAUSE_EVERY_PAGES > 0 && page % SCAN_PAUSE_EVERY_PAGES === 0) {
        await delay(SCAN_PAUSE_MS);
      } else {
        await delay(randomBetween(SCAN_DELAY_MIN_MS, SCAN_DELAY_MAX_MS));
      }
    }

    return all;
  }

  private async igGet(url: string, list: 'following' | 'followers'): Promise<FriendshipsPage> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(url, {
        headers: this.igHeaders(),
        credentials: 'include',
      });

      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(t('authError'));
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Request failed with status: ${response.status}`);
        }
        const retryAfter = Number(response.headers.get('retry-after'));
        const wait = retryAfter > 0 ? retryAfter * 1000 : BACKOFF_BASE_MS * 2 ** attempt;
        await delay(wait + randomBetween(0, 500));
        continue;
      }

      if (!response.ok) throw new Error(`Request failed with status: ${response.status}`);

      const data = (await response.json()) as FriendshipsPage;
      if (data.status && data.status !== 'ok') {
        throw new Error(data.message || `Failed to fetch ${list}`);
      }

      return data;
    }
  }

  private async getProfileCounts(): Promise<{ following: number | null; followers: number | null }> {
    try {
      const username = this.sharedData.config.viewer.username;
      const response = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          headers: this.igHeaders(),
          credentials: 'include',
        },
      );

      if (!response.ok) return { following: null, followers: null };

      const json = await response.json();
      const user = json.data?.user;
      return {
        following: user?.edge_follow?.count ?? user?.following_count ?? null,
        followers: user?.edge_followed_by?.count ?? user?.follower_count ?? null,
      };
    } catch {
      return { following: null, followers: null };
    }
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getSharedData(): Promise<InstagramSharedData | undefined> {
  if (!location.href.includes('instagram.com')) return;

  const res = await fetch('/data/shared_data/');

  if (res.status === 401 || res.status === 403) {
    throw new AuthenticationError(t('authError'));
  }

  return res.json();
}
