import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@extension/i18n', () => ({ t: (key: string) => key }));

import { Instagram, ScanCancelledError, ScanStoppedError } from '../instagram';
import type { InstagramSharedData } from '../shared-types';
import type { ScanPacing } from '../pacing';
import type { ScanCheckpoint } from '../scan-checkpoint';

const NO_DELAY: ScanPacing = {
  fastPages: 0,
  fastDelayMinMs: 0,
  fastDelayMaxMs: 0,
  delayMinMs: 0,
  delayMaxMs: 1,
  pauseEveryPages: 0,
  pauseMs: 0,
};

const sharedData = {
  config: { viewerId: '42', csrf_token: 'csrf', viewer: { id: '42', fbid: '42', username: 'me' } },
} as unknown as InstagramSharedData;

type Route = (url: URL, init?: RequestInit) => Response | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function user(id: string, extra: Record<string, unknown> = {}) {
  return { pk_id: id, username: `user${id}`, full_name: `User ${id}`, ...extra };
}

function installFetch(routes: Route[]) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://www.instagram.com');
    calls.push(
      `${init?.method ?? 'GET'} ${url.pathname}${url.searchParams.get('max_id') ? `?max_id=${url.searchParams.get('max_id')}` : ''}`,
    );
    for (const route of routes) {
      const response = route(url, init);
      if (response) return response;
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const profileInfo: Route = url =>
  url.pathname.endsWith('/info/') ? json({ user: { following_count: 4, follower_count: 3 } }) : undefined;

describe('Instagram scan', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { cookie: 'csrftoken=abc', querySelectorAll: () => [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('steps over empty following pages and finds non-followers', async () => {
    installFetch([
      profileInfo,
      url => {
        if (!url.pathname.endsWith('/following/')) return undefined;
        const cursor = url.searchParams.get('max_id');
        if (!cursor) return json({ users: [user('1'), user('2')], next_max_id: 'c1' });
        if (cursor === 'c1') return json({ users: [], next_max_id: 'c2' });
        return json({ users: [user('3')], next_max_id: null });
      },
      url => (url.pathname.endsWith('/followers/') ? json({ users: [user('2')], next_max_id: null }) : undefined),
    ]);

    const instagram = new Instagram(sharedData);
    const result = await instagram.getPeople({ pacing: NO_DELAY });

    expect(result.users.map(found => found.id).sort()).toEqual(['1', '3']);
    expect(result.incomplete).toBe(false);
  });

  it('stops on a repeated rate limit and keeps the progress made so far', async () => {
    vi.useFakeTimers();
    installFetch([
      profileInfo,
      url => {
        if (!url.pathname.endsWith('/following/')) return undefined;
        if (!url.searchParams.get('max_id')) return json({ users: [user('1'), user('2')], next_max_id: 'c1' });
        return json({ message: 'Please wait a few minutes before you try again.', require_login: true }, 401);
      },
    ]);

    const instagram = new Instagram(sharedData);
    const scan = instagram.getPeople({ pacing: NO_DELAY });
    const outcome = scan.catch(error => error);
    await vi.runAllTimersAsync();
    const error = await outcome;

    expect(error).toBeInstanceOf(ScanStoppedError);
    expect((error as ScanStoppedError).reason).toBe('rate');
    expect(instagram.checkpoint?.following.map(found => found.pk_id)).toEqual(['1', '2']);
    expect(instagram.checkpoint?.followingCursor).toBe('c1');
    expect(instagram.lastHttp?.status).toBe(401);
  });

  it('resumes from the saved cursor without asking for earlier pages again', async () => {
    const calls = installFetch([
      profileInfo,
      url => {
        if (!url.pathname.endsWith('/following/')) return undefined;
        if (url.searchParams.get('max_id') === 'c1') return json({ users: [user('3')], next_max_id: null });
        return json({ users: [user('1'), user('2')], next_max_id: 'c1' });
      },
      url => (url.pathname.endsWith('/followers/') ? json({ users: [user('1')], next_max_id: null }) : undefined),
    ]);

    const resume: ScanCheckpoint = {
      version: 1,
      viewerId: '42',
      savedAt: Date.now(),
      following: [user('1'), user('2')],
      followingCursor: 'c1',
      followingEmptyRun: 0,
      followingDone: false,
      followingTotal: 3,
      followersTotal: 1,
      followBackIds: [],
      notFollowBackIds: [],
      followingGap: false,
      cooldownUntil: 0,
      stopReason: 'rate',
    };

    const instagram = new Instagram(sharedData);
    const result = await instagram.getPeople({ pacing: NO_DELAY, resume });

    expect(calls.filter(call => call.includes('/following/'))).toEqual([
      'GET /api/v1/friendships/42/following/?max_id=c1',
    ]);
    expect(calls.some(call => call.includes('/info/'))).toBe(false);
    expect(result.users.map(found => found.id).sort()).toEqual(['2', '3']);
  });

  it('reuses follow-back answers already saved in the checkpoint', async () => {
    const calls = installFetch([profileInfo]);
    const resume: ScanCheckpoint = {
      version: 1,
      viewerId: '42',
      savedAt: Date.now(),
      following: [user('1'), user('2')],
      followingEmptyRun: 0,
      followingDone: true,
      followingTotal: 2,
      followersTotal: 5000,
      followBackIds: ['1'],
      notFollowBackIds: ['2'],
      followingGap: false,
      cooldownUntil: 0,
    };

    const result = await new Instagram(sharedData).getPeople({ pacing: NO_DELAY, resume });

    expect(calls).toEqual([]);
    expect(result.users.map(found => found.id)).toEqual(['2']);
  });

  it('marks the result incomplete when the following list ends with a repeated cursor', async () => {
    installFetch([
      profileInfo,
      url => {
        if (!url.pathname.endsWith('/following/')) return undefined;
        return json({ users: [user('1', { friendship_status: { followed_by: true } })], next_max_id: 'same' });
      },
    ]);

    const instagram = new Instagram(sharedData);
    const result = await instagram.getPeople({ pacing: NO_DELAY });

    expect(result.users).toEqual([]);
    expect(result.incomplete).toBe(true);
  });

  it('stops at once when Instagram blocks list requests', async () => {
    installFetch([
      profileInfo,
      url => (url.pathname.endsWith('/following/') ? json({ message: 'checkpoint_required' }, 400) : undefined),
    ]);

    const error = await new Instagram(sharedData).getPeople({ pacing: NO_DELAY }).catch(caught => caught);
    expect(error).toBeInstanceOf(ScanStoppedError);
    expect((error as ScanStoppedError).reason).toBe('blocked');
  });
});

describe('Instagram scan safety', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { cookie: 'csrftoken=abc', querySelectorAll: () => [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const followingOf =
    (ids: string[]): Route =>
    url =>
      url.pathname.endsWith('/following/') ? json({ users: ids.map(id => user(id)), next_max_id: null }) : undefined;

  it('does not trust a followers list that ends far short of the follower count', async () => {
    const calls = installFetch([
      url =>
        url.pathname.endsWith('/info/') ? json({ user: { following_count: 2, follower_count: 200 } }) : undefined,
      followingOf(['1', '2']),
      // Only 1 of 200 followers arrives before the list "ends".
      url => (url.pathname.endsWith('/followers/') ? json({ users: [user('7')], next_max_id: null }) : undefined),
      url =>
        url.pathname.endsWith('/show_many/')
          ? json({ friendship_statuses: { '1': { followed_by: true }, '2': { followed_by: false } }, status: 'ok' })
          : undefined,
    ]);

    const result = await new Instagram(sharedData).getPeople({ pacing: NO_DELAY });

    expect(calls.some(call => call.includes('/show_many/'))).toBe(true);
    expect(result.users.map(found => found.id)).toEqual(['2']);
  });

  it('treats "more" without a cursor in the followers list as unknown, not as non-followers', async () => {
    installFetch([
      url => (url.pathname.endsWith('/info/') ? json({ user: { following_count: 2, follower_count: 1 } }) : undefined),
      followingOf(['1', '2']),
      url =>
        url.pathname.endsWith('/followers/')
          ? json({ users: [user('9')], next_max_id: null, has_more: true })
          : undefined,
      url => (url.pathname.endsWith('/show_many/') ? json({ message: 'oops' }, 500) : undefined),
    ]);

    vi.useFakeTimers();
    const scan = new Instagram(sharedData).getPeople({ pacing: NO_DELAY });
    await vi.runAllTimersAsync();
    const result = await scan;
    vi.useRealTimers();

    // Neither account could be checked, so neither is offered for unfollowing.
    expect(result.users).toEqual([]);
    expect(result.incomplete).toBe(true);
  });

  it('asks again about old "does not follow back" answers on resume', async () => {
    const calls = installFetch([
      url =>
        url.pathname.endsWith('/show_many/')
          ? json({ friendship_statuses: { '2': { followed_by: true } }, status: 'ok' })
          : undefined,
    ]);
    const resume: ScanCheckpoint = {
      version: 1,
      viewerId: '42',
      savedAt: Date.now() - 2 * 60 * 60 * 1000,
      following: [user('1'), user('2')],
      followingEmptyRun: 0,
      followingDone: true,
      followingTotal: 2,
      followersTotal: 5000,
      followBackIds: ['1'],
      notFollowBackIds: ['2'],
      followingGap: false,
      cooldownUntil: 0,
    };

    const result = await new Instagram(sharedData).getPeople({ pacing: NO_DELAY, resume });

    expect(calls).toEqual(['POST /api/v1/friendships/show_many/']);
    expect(result.users).toEqual([]);
  });

  it('falls back to show_many when the followers list answers with a page instead of JSON', async () => {
    const calls = installFetch([
      url => (url.pathname.endsWith('/info/') ? json({ user: { following_count: 2, follower_count: 10 } }) : undefined),
      followingOf(['1', '2']),
      url => (url.pathname.endsWith('/followers/') ? new Response('<html><title>Instagram</title></html>') : undefined),
      url =>
        url.pathname.endsWith('/show_many/')
          ? json({ friendship_statuses: { '1': { followed_by: true }, '2': { followed_by: false } }, status: 'ok' })
          : undefined,
    ]);

    const result = await new Instagram(sharedData).getPeople({ pacing: NO_DELAY });

    expect(calls.some(call => call.includes('/show_many/'))).toBe(true);
    expect(result.users.map(found => found.id)).toEqual(['2']);
    expect(result.incomplete).toBe(false);
  });

  it('stops with a sign-out only when Instagram redirects to the login page', async () => {
    const loginPage = new Response('<html><title>Login</title></html>');
    Object.defineProperty(loginPage, 'redirected', { value: true });
    Object.defineProperty(loginPage, 'url', { value: 'https://www.instagram.com/accounts/login/?next=x' });
    const instagram = new Instagram(sharedData);
    installFetch([
      url => (url.pathname.endsWith('/info/') ? json({ user: { following_count: 2, follower_count: 2 } }) : undefined),
      url => (url.pathname.endsWith('/following/') ? loginPage : undefined),
    ]);

    const error = await instagram.getPeople({ pacing: NO_DELAY }).catch(caught => caught);
    expect(error).toMatchObject({ name: 'AuthenticationError' });
    expect(instagram.lastHttp?.message).toBe('html "Login" → /accounts/login/');
  });
});

describe('Instagram unfollow', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      cookie: 'csrftoken=abc',
      querySelectorAll: () => [{ textContent: '["DTSGInitialData",[],{"token":"dt"}] ["LSD",[],{"token":"ls"}]' }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const target = {
    id: '9',
    username: 'target',
    full_name: '',
    image: '',
    isFollowingMe: false,
    isPrivate: false,
    isVerified: false,
  };

  it('uses only the GraphQL mutation and succeeds when it confirms', async () => {
    const calls = installFetch([
      url =>
        url.pathname === '/api/graphql'
          ? json({ data: { xdt_destroy: { friendship_status: { following: false } } } })
          : undefined,
    ]);

    await expect(new Instagram(sharedData).unFollow(target)).resolves.toEqual({ status: true, deletedId: '9' });
    expect(calls).toEqual(['POST /api/graphql']);
  });

  it('unfollows as the cookie account when there is no profile data', async () => {
    let actorId: string | undefined;
    installFetch([
      (url, init) => {
        if (url.pathname !== '/api/graphql') return undefined;
        actorId = (init?.body as URLSearchParams).get('av') ?? undefined;
        return json({ data: { xdt_destroy: { friendship_status: { following: false } } } });
      },
    ]);

    const cookieOnly = new Instagram({ config: { viewerId: '42', csrf_token: 'abc' } });
    await expect(cookieOnly.unFollow(target)).resolves.toEqual({ status: true, deletedId: '9' });
    expect(actorId).toBe('42');
  });

  it('asks Instagram whether the follow is gone when the mutation only says ok', async () => {
    const calls = installFetch([
      url => (url.pathname === '/api/graphql' ? json({ data: { xdt_destroy: {} }, status: 'ok' }) : undefined),
      url => (url.pathname === '/api/v1/friendships/show/9/' ? json({ following: false, status: 'ok' }) : undefined),
    ]);

    await expect(new Instagram(sharedData).unFollow(target)).resolves.toEqual({ status: true, deletedId: '9' });
    expect(calls).toEqual(['POST /api/graphql', 'GET /api/v1/friendships/show/9/']);
  });

  it('fails when Instagram says the account is still followed', async () => {
    installFetch([
      url => (url.pathname === '/api/graphql' ? json({ data: { xdt_destroy: {} }, status: 'ok' }) : undefined),
      url => (url.pathname === '/api/v1/friendships/show/9/' ? json({ following: true, status: 'ok' }) : undefined),
    ]);

    await expect(new Instagram(sharedData).unFollow(target)).rejects.toThrow('unfollowFailed');
  });

  it('fails when the follow check itself fails, instead of assuming success', async () => {
    installFetch([
      url => (url.pathname === '/api/graphql' ? json({ data: { xdt_destroy: {} }, status: 'ok' }) : undefined),
      url => (url.pathname === '/api/v1/friendships/show/9/' ? json({}, 500) : undefined),
    ]);

    await expect(new Instagram(sharedData).unFollow(target)).rejects.toThrow('unfollowFailed');
  });

  it('does not fetch the home page again right after failing to find session tokens', async () => {
    vi.stubGlobal('document', { cookie: 'csrftoken=abc', querySelectorAll: () => [] });
    const calls = installFetch([url => (url.pathname === '/' ? new Response('<html></html>') : undefined)]);
    const instagram = new Instagram(sharedData);

    await expect(instagram.unFollow(target)).rejects.toThrow('unfollowFailed');
    await expect(instagram.unFollow(target)).rejects.toThrow('unfollowFailed');
    expect(calls).toEqual(['GET /']);
  });

  it('reports a block when Instagram rate-limits the mutation', async () => {
    installFetch([
      url => (url.pathname === '/api/graphql' ? json({ message: 'Please wait a few minutes' }, 429) : undefined),
    ]);

    await expect(new Instagram(sharedData).unFollow(target)).rejects.toMatchObject({ name: 'ActionBlockedError' });
  });

  it('reads session tokens from the home page when the page scripts have none', async () => {
    vi.stubGlobal('document', { cookie: 'csrftoken=abc', querySelectorAll: () => [] });
    const calls = installFetch([
      url =>
        url.pathname === '/'
          ? new Response('<script>["DTSGInitialData",[],{"token":"dt"}]["LSD",[],{"token":"ls"}]</script>')
          : undefined,
      url =>
        url.pathname === '/api/graphql'
          ? json({ data: { xdt_destroy: { friendship_status: { following: false } } } })
          : undefined,
    ]);

    await expect(new Instagram(sharedData).unFollow(target)).resolves.toMatchObject({ status: true });
    expect(calls).toEqual(['GET /', 'POST /api/graphql']);
  });
});

describe('cancelling a scan', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { cookie: 'csrftoken=abc', querySelectorAll: () => [] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stops with ScanCancelledError and keeps the progress when aborted', async () => {
    const controller = new AbortController();
    installFetch([
      url => {
        if (url.pathname.includes('/info/')) return json({ user: { following_count: 10, follower_count: 10 } });
        if (url.pathname.includes('/following/')) {
          controller.abort();
          return json({ status: 'ok', users: [user('1')], next_max_id: 'a', has_more: true });
        }
        return undefined;
      },
    ]);
    const instagram = new Instagram(sharedData);

    await expect(instagram.getPeople({ pacing: NO_DELAY, signal: controller.signal })).rejects.toBeInstanceOf(
      ScanCancelledError,
    );
    expect(instagram.checkpoint?.following).toHaveLength(1);
  });
});
