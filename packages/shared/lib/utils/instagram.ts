import type { InstagramSharedData, User } from '.';
import { t } from '@extension/i18n';

const IG_WEB_APP_ID = '936619743392459';
const FRIENDSHIP_PAGE_SIZE = 50;
const PAGE_DELAY_MS = 350;

interface FriendshipStatus {
  following?: boolean;
  followed_by?: boolean;
}

interface FriendshipUser {
  pk?: number | string;
  pk_id?: string;
  id?: string;
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  is_private?: boolean;
  is_verified?: boolean;
  friendship_status?: FriendshipStatus;
}

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

export class Instagram {
  sharedData: InstagramSharedData;
  followings: User[] = [];

  constructor(sharedData: InstagramSharedData) {
    this.sharedData = sharedData;
  }

  async getPeople() {
    this.clearStorage();
    await this.getFollowing();
    return this.getUnFollowers();
  }

  async unFollow(user: User) {
    const paths = [`/api/v1/web/friendships/${user.id}/unfollow/`, `/web/friendships/${user.id}/unfollow/`];

    for (const path of paths) {
      try {
        const response = await this.postForm(path, {
          user_id: user.id,
          container_module: 'profile',
        });
        const data = await response.json();
        if (data.status === 'ok' || data.friendship_status?.following === false) {
          return { status: true, deletedId: user.id };
        }
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
      }
    }

    throw new Error('Unfollow failed');
  }

  async getFollowing(): Promise<void> {
    const following = await this.fetchFriendshipUsers('following');

    if (following.length === 0) {
      const expectedCount = await this.getFollowingCount();
      if (expectedCount && expectedCount > 0) {
        throw new Error('Following list could not be loaded');
      }
      this.followings = [];
      return;
    }

    const followBackIds = await this.getFollowBackIds(following);

    this.followings = following.flatMap(user => {
      const id = getFriendshipUserId(user);
      if (!id || !user.username) return [];

      return [
        {
          id,
          username: user.username,
          full_name: user.full_name ?? '',
          image: user.profile_pic_url ?? '',
          isFollowingMe: followBackIds.has(id),
          isPrivate: Boolean(user.is_private),
          isVerified: Boolean(user.is_verified),
        },
      ];
    });
  }

  getUnFollowers() {
    return this.followings.filter(following => !following.isFollowingMe);
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

    if (!response.ok) throw response;

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

  private async getFollowBackIds(users: FriendshipUser[]): Promise<Set<string>> {
    if (users.every(user => typeof user.friendship_status?.followed_by === 'boolean')) {
      return new Set(
        users
          .filter(user => user.friendship_status?.followed_by)
          .map(getFriendshipUserId)
          .filter(Boolean),
      );
    }

    const followers = await this.fetchFriendshipUsers('followers');
    return new Set(followers.map(getFriendshipUserId).filter(Boolean));
  }

  private async fetchFriendshipUsers(list: 'following' | 'followers', maxId?: string): Promise<FriendshipUser[]> {
    const userId = this.sharedData.config.viewerId;
    const url = new URL(`https://www.instagram.com/api/v1/friendships/${userId}/${list}/`);
    url.searchParams.set('count', String(FRIENDSHIP_PAGE_SIZE));
    url.searchParams.set('search_surface', 'follow_list_page');
    if (maxId) url.searchParams.set('max_id', maxId);

    const response = await fetch(url.toString(), {
      headers: this.igHeaders(),
      credentials: 'include',
    });

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(t('authError'));
    }

    if (!response.ok) throw new Error(`Request failed with status: ${response.status}`);

    const data = (await response.json()) as FriendshipsPage;
    if (data.status && data.status !== 'ok') {
      throw new Error(data.message || `Failed to fetch ${list}`);
    }

    const users = data.users ?? [];
    const nextMaxId = data.next_max_id;

    if (nextMaxId && users.length > 0 && nextMaxId !== maxId) {
      await delay(PAGE_DELAY_MS);
      return users.concat(await this.fetchFriendshipUsers(list, nextMaxId));
    }

    return users;
  }

  private async getFollowingCount(): Promise<number | null> {
    try {
      const username = this.sharedData.config.viewer.username;
      const response = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          headers: this.igHeaders(),
          credentials: 'include',
        },
      );

      if (!response.ok) return null;

      const json = await response.json();
      return json.data?.user?.edge_follow?.count ?? json.data?.user?.following_count ?? null;
    } catch {
      return null;
    }
  }
}

function getFriendshipUserId(user: FriendshipUser) {
  return String(user.pk_id ?? user.id ?? user.pk ?? '');
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
