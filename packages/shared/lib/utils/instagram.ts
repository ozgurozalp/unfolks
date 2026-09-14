import type { InstagramSharedData, ScanProgress, User } from '.';
import { t } from '@extension/i18n';
import {
  computeUnfollowers,
  extractFollowBackIds,
  extractGraphqlTokens,
  getFriendshipUserId,
  inlineFollowBackIds,
  isActionBlocked,
  isGraphqlUnfollowBlocked,
  isGraphqlUnfollowSuccess,
  isRetryableIgFail,
  jazoestFromDtsg,
  mapWithPool,
  mapFollowingToUsers,
  randomBetween,
  shouldAbortFollowersScan,
  shouldSkipFollowersScan,
  shouldStopPaging,
  UNFOLLOW_DOC_ID,
  UNFOLLOW_FRIENDLY_NAME,
  usersMissingFollowedBy,
  type FriendshipShowResponse,
  type FriendshipUser,
  type GraphqlTokens,
  type UnfollowResponse,
} from './instagram-utils';

const IG_WEB_APP_ID = '936619743392459';
const FRIENDSHIP_PAGE_SIZE = 200;
const SCAN_DELAY_MIN_MS = 700;
const SCAN_DELAY_MAX_MS = 1500;
const SCAN_PAUSE_EVERY_PAGES = 5;
const SCAN_PAUSE_MS = 8000;
/**
 * show/{id} is the only per-user web source of `followed_by`, used for whoever
 * the followers walk could not confirm. A few in-flight requests with ~5/s start
 * spacing keeps a 200-follow scan around 40s without a 10-wide burst.
 */
const SHOW_CONCURRENCY = 4;
const SHOW_START_GAP_MIN_MS = 120;
const SHOW_START_GAP_MAX_MS = 200;
/** Observed followers page size: the endpoint ignores `count` and sends ~23 users. */
const FOLLOWERS_PAGE_SIZE = 23;
const FOLLOWERS_ABORT_MARGIN = 5;
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

interface ProfileCounts {
  following: number | null;
  followers: number | null;
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
  private showNextStartAt = 0;
  private graphqlTokens: GraphqlTokens | null | undefined;

  constructor(sharedData: InstagramSharedData) {
    this.sharedData = sharedData;
  }

  async getPeople(onProgress?: ProgressCallback) {
    this.clearStorage();
    await this.getFollowing(onProgress);
    return this.getUnFollowers();
  }

  async unFollow(user: User) {
    const graphql = await this.unFollowViaGraphql(user);
    if (graphql === 'ok') return { status: true, deletedId: user.id };
    if (graphql === 'blocked') throw new ActionBlockedError(t('actionBlocked'));

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
    const followingEstimate = counts.following ?? 0;

    const following = await this.fetchFriendshipUsers('following', loaded =>
      onProgress?.({
        phase: 'following',
        current: loaded,
        total: Math.max(followingEstimate, loaded) * 2,
      }),
    );

    if (following.length === 0) {
      if (counts.following && counts.following > 0) {
        throw new Error('Following list could not be loaded');
      }
      this.followings = [];
      return;
    }

    const followBackIds = await this.getFollowBackIds(following, counts.followers, onProgress);

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

  private readGraphqlTokens(): GraphqlTokens | null {
    if (this.graphqlTokens !== undefined) return this.graphqlTokens;
    if (typeof document === 'undefined') {
      this.graphqlTokens = null;
      return null;
    }

    const scripts = document.querySelectorAll('script');
    const chunks: string[] = [];
    for (let i = 0; i < scripts.length; i += 1) {
      const text = scripts[i].textContent;
      if (text && (text.includes('DTSG') || text.includes('LSD') || text.includes('asbd'))) {
        chunks.push(text);
      }
    }

    this.graphqlTokens = extractGraphqlTokens(chunks.join('\n'));
    return this.graphqlTokens;
  }

  /**
   * Instagram web unfollows through Relay (`usePolarisUnfollowMutation`).
   * Session tokens come from the page; REST is used when GraphQL is unavailable.
   */
  private async unFollowViaGraphql(user: User): Promise<'ok' | 'blocked' | 'miss'> {
    const tokens = this.readGraphqlTokens();
    if (!tokens) return 'miss';

    try {
      const actorId = this.sharedData.config.viewer.fbid || this.sharedData.config.viewerId;
      const headers: Record<string, string> = {
        ...this.igHeaders(),
        'content-type': 'application/x-www-form-urlencoded',
        'x-fb-friendly-name': UNFOLLOW_FRIENDLY_NAME,
        'x-fb-lsd': tokens.lsd,
      };
      if (tokens.asbdId) headers['x-asbd-id'] = tokens.asbdId;

      const response = await fetch('https://www.instagram.com/api/graphql', {
        headers,
        referrerPolicy: 'strict-origin-when-cross-origin',
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        body: new URLSearchParams({
          av: actorId,
          __d: 'www',
          __user: '0',
          __a: '1',
          __comet_req: '7',
          fb_dtsg: tokens.dtsg,
          jazoest: jazoestFromDtsg(tokens.dtsg),
          lsd: tokens.lsd,
          fb_api_caller_class: 'RelayModern',
          fb_api_req_friendly_name: UNFOLLOW_FRIENDLY_NAME,
          server_timestamps: 'true',
          variables: JSON.stringify({
            target_user_id: user.id,
            container_module: 'profile',
          }),
          doc_id: UNFOLLOW_DOC_ID,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(t('authError'));
      }

      let payload: unknown = {};
      try {
        payload = await response.json();
      } catch {
        return 'miss';
      }

      if (isGraphqlUnfollowBlocked(response.status, payload)) return 'blocked';
      if (isGraphqlUnfollowSuccess(payload)) return 'ok';
      return 'miss';
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      return 'miss';
    }
  }

  private async getFollowBackIds(
    users: FriendshipUser[],
    followersCount: number | null,
    onProgress?: ProgressCallback,
  ): Promise<Set<string>> {
    const followingCount = users.length;
    const total = followingCount * 2;
    const completeInlineIds = extractFollowBackIds(users);
    if (completeInlineIds) {
      onProgress?.({ phase: 'followers', current: total, total });
      return completeInlineIds;
    }

    const followBackIds = inlineFollowBackIds(users);
    const missing = usersMissingFollowedBy(users);
    if (missing.length === 0) {
      onProgress?.({ phase: 'followers', current: total, total });
      return followBackIds;
    }

    const skipFollowers = shouldSkipFollowersScan(followersCount, missing.length, FOLLOWERS_PAGE_SIZE);
    const { confirmed, complete } = skipFollowers
      ? { confirmed: new Set<string>(), complete: false }
      : await this.collectFollowBackFromFollowers(new Set(missing.map(getFriendshipUserId)), found =>
          onProgress?.({ phase: 'followers', current: followingCount + found, total }),
        );

    for (const id of confirmed) followBackIds.add(id);

    if (complete) {
      onProgress?.({ phase: 'followers', current: total, total });
      return followBackIds;
    }

    const needShow = missing.filter(user => !confirmed.has(getFriendshipUserId(user)));
    this.showNextStartAt = 0;

    const shown = await mapWithPool(
      needShow,
      SHOW_CONCURRENCY,
      async user => {
        const id = getFriendshipUserId(user);
        await this.waitForShowSlot();
        const data = await this.fetchFriendshipShow(id);
        return { id, followedBy: data.followed_by === true };
      },
      done => onProgress?.({ phase: 'followers', current: followingCount + confirmed.size + done, total }),
    );

    for (const row of shown) {
      if (row.followedBy) followBackIds.add(row.id);
    }

    return followBackIds;
  }

  /**
   * Walk the viewer's followers list and mark which `candidateIds` appear in it.
   * When `complete` is false the walk stopped early, so a missing id means
   * "unknown" and still needs a `show/{id}` lookup.
   */
  private async collectFollowBackFromFollowers(
    candidateIds: Set<string>,
    onConfirm?: (confirmed: number) => void,
  ): Promise<{ confirmed: Set<string>; complete: boolean }> {
    const confirmed = new Set<string>();
    let maxId: string | undefined;
    let pages = 0;

    for (;;) {
      let data: FriendshipsPage;
      try {
        data = await this.igGetJson<FriendshipsPage>(this.friendshipListUrl('followers', maxId), 'followers');
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        return { confirmed, complete: false };
      }

      const users = data.users ?? [];
      for (const user of users) {
        const id = getFriendshipUserId(user);
        if (candidateIds.has(id)) confirmed.add(id);
      }

      pages += 1;
      onConfirm?.(confirmed.size);

      if (confirmed.size === candidateIds.size) return { confirmed, complete: true };

      const nextMaxId = data.next_max_id;
      if (shouldStopPaging(nextMaxId, users.length, maxId)) return { confirmed, complete: true };
      if (shouldAbortFollowersScan(pages, confirmed.size, FOLLOWERS_ABORT_MARGIN)) {
        return { confirmed, complete: false };
      }

      maxId = nextMaxId as string;
      await this.pacePage(pages);
    }
  }

  private async waitForShowSlot() {
    const gap = randomBetween(SHOW_START_GAP_MIN_MS, SHOW_START_GAP_MAX_MS);
    const startAt = Math.max(Date.now(), this.showNextStartAt);
    this.showNextStartAt = startAt + gap;
    const wait = startAt - Date.now();
    if (wait > 0) await delay(wait);
  }

  private async fetchFriendshipShow(userId: string): Promise<FriendshipShowResponse> {
    const url = `https://www.instagram.com/api/v1/friendships/show/${encodeURIComponent(userId)}/`;
    return this.igGetJson<FriendshipShowResponse>(url, 'friendship');
  }

  private friendshipListUrl(list: 'following' | 'followers', maxId?: string): string {
    const url = new URL(`https://www.instagram.com/api/v1/friendships/${this.sharedData.config.viewerId}/${list}/`);
    url.searchParams.set('count', String(FRIENDSHIP_PAGE_SIZE));
    url.searchParams.set('search_surface', 'follow_list_page');
    if (maxId) url.searchParams.set('max_id', maxId);
    return url.toString();
  }

  private async pacePage(page: number) {
    if (SCAN_PAUSE_EVERY_PAGES > 0 && page % SCAN_PAUSE_EVERY_PAGES === 0) {
      await delay(SCAN_PAUSE_MS);
    } else {
      await delay(randomBetween(SCAN_DELAY_MIN_MS, SCAN_DELAY_MAX_MS));
    }
  }

  private async fetchFriendshipUsers(
    list: 'following' | 'followers',
    onPage?: (loaded: number) => void,
  ): Promise<FriendshipUser[]> {
    const all: FriendshipUser[] = [];
    let maxId: string | undefined;
    let page = 0;

    for (;;) {
      const data = await this.igGetJson<FriendshipsPage>(this.friendshipListUrl(list, maxId), list);
      const users = data.users ?? [];
      all.push(...users);
      onPage?.(all.length);
      page += 1;

      const nextMaxId = data.next_max_id;
      if (shouldStopPaging(nextMaxId, users.length, maxId)) break;
      maxId = nextMaxId as string;

      await this.pacePage(page);
    }

    return all;
  }

  private async igGetJson<T extends { status?: string; message?: string }>(url: string, label: string): Promise<T> {
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
        const wait = retryAfter > 0 ? retryAfter * 1000 : Math.max(8000, BACKOFF_BASE_MS * 2 ** attempt);
        await delay(wait + randomBetween(0, 1000));
        continue;
      }

      if (!response.ok) throw new Error(`Request failed with status: ${response.status}`);

      const data = (await response.json()) as T;
      if (data.status && data.status !== 'ok') {
        if (attempt < MAX_RETRIES && isRetryableIgFail(data)) {
          await delay(Math.max(8000, BACKOFF_BASE_MS * 2 ** attempt) + randomBetween(0, 1000));
          continue;
        }
        throw new Error(data.message || `Failed to fetch ${label}`);
      }

      return data;
    }
  }

  private async getProfileCounts(): Promise<ProfileCounts> {
    try {
      const response = await fetch(`https://www.instagram.com/api/v1/users/${this.sharedData.config.viewerId}/info/`, {
        headers: this.igHeaders(),
        credentials: 'include',
      });

      if (!response.ok) return { following: null, followers: null };

      const json = (await response.json()) as { user?: { following_count?: number; follower_count?: number } };
      return {
        following: json.user?.following_count ?? null,
        followers: json.user?.follower_count ?? null,
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
