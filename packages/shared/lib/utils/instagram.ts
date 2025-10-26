import type { Options, User } from '.';
import { TYPES } from '.';
import { t } from '@extension/i18n';

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class Instagram {
  sharedData: any;
  followings: User[] = [];

  constructor(sharedData: any) {
    this.sharedData = sharedData;
  }

  async getPeople() {
    this.clearStorage();
    await this.getFollowing();
    return this.getUnFollowers();
  }

  async unFollow(user: User) {
    const link = `https://www.instagram.com/web/friendships/${user.id}/unfollow/`;
    const response = await fetch(link, {
      headers: {
        'x-csrftoken': this.sharedData.config.csrf_token,
      },
      referrer: `https://www.instagram.com/${user.username}/`,
      referrerPolicy: 'strict-origin-when-cross-origin',
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
    });

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(t('authError'));
    }

    if (!response.ok) throw response;

    const data = await response.json();
    return {
      status: data.status === 'ok',
      deletedId: user.id,
    };
  }

  async getFollowing(options: Options = {}): Promise<void> {
    const urlParams = {
      query_hash: TYPES.FOLLOWING_HASH,
      variables: JSON.stringify({
        id: this.sharedData.config.viewerId,
        include_reel: true,
        fetch_mutual: false,
        first: this.sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user?.edge_followed_by?.count ?? 100,
        ...(options.has_next_page && { after: options.end_cursor }),
      }),
    };

    try {
      const url = getURL(urlParams);
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(t('authError'));
      }

      if (!response.ok) throw new Error(`Request failed with status: ${response.status}`);

      const { data } = await response.json();
      const {
        edges: followEdges,
        page_info: { has_next_page, end_cursor },
      } = data.user.edge_follow;

      this.setFollowings(followEdges);

      if (has_next_page) {
        await this.getFollowing({ has_next_page, end_cursor });
      }
    } catch (error) {
      console.error('Error fetching following data:', error);
      throw error;
    }
  }
  setFollowings(_followings: any[]) {
    for (const { node: following } of _followings) {
      this.followings.push({
        username: following.username,
        full_name: following.full_name,
        image: following.profile_pic_url,
        isFollowingMe: following.follows_viewer,
        isPrivate: following.is_private,
        isVerified: following.is_verified,
        id: following.id,
      });
    }
  }

  getUnFollowers() {
    return this.followings.filter(following => !following.isFollowingMe);
  }
  clearStorage() {
    this.followings = [];
  }
}

function getURL(data: any) {
  const url = new URL('https://www.instagram.com/graphql/query/');
  Object.keys(data).forEach(key => url.searchParams.append(key, data[key]));
  return url.toString();
}

export async function getSharedData() {
  if (!location.href.includes('instagram.com')) return;

  const res = await fetch('/data/shared_data/');

  if (res.status === 401 || res.status === 403) {
    throw new AuthenticationError(t('authError'));
  }

  return res.json();
}
