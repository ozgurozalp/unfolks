import { describe, expect, it } from 'vitest';

import {
  createCookieSession,
  createSessionCache,
  readLoggedInUserId,
  readSessionCache,
  SESSION_CACHE_MAX_STALE_MS,
  SESSION_CACHE_TTL_MS,
  type InstagramSession,
} from '../session-cache';

const profile = {
  id: '42',
  fbid: '17',
  username: 'me',
  full_name: 'Me',
  profile_pic_url: 'https://cdn/p.jpg',
  profile_pic_url_hd: 'https://cdn/p_hd.jpg',
};

const session: InstagramSession = {
  config: {
    viewerId: '42',
    csrf_token: 'csrf',
    viewer: { ...profile, business_email: 'x@y.z', biography: 'bio' } as InstagramSession['config']['viewer'],
  },
};

/** What a saved session reads back as: the token and extra profile fields are gone. */
const restored: InstagramSession = { config: { viewerId: '42', csrf_token: '', viewer: profile } };

const NOW = 1_000_000_000;

describe('createSessionCache', () => {
  it('saves only the account id and the profile card fields, never the token', () => {
    const saved = createSessionCache(session, NOW);
    expect(saved).toEqual({ version: 1, viewerId: '42', savedAt: NOW, viewer: profile });
    expect(JSON.stringify(saved)).not.toContain('csrf');
    expect(JSON.stringify(saved)).not.toContain('x@y.z');
  });
});

describe('readSessionCache', () => {
  it('returns the saved session for the same account within the TTL', () => {
    const raw = createSessionCache(session, NOW);
    expect(readSessionCache(raw, '42', NOW + SESSION_CACHE_TTL_MS - 1)).toEqual(restored);
  });

  it('ignores a session saved for another account', () => {
    const raw = createSessionCache(session, NOW);
    expect(readSessionCache(raw, '7', NOW)).toBeNull();
  });

  it('ignores a session older than the TTL unless a longer age is allowed', () => {
    const raw = createSessionCache(session, NOW);
    const later = NOW + SESSION_CACHE_TTL_MS + 1;
    expect(readSessionCache(raw, '42', later)).toBeNull();
    expect(readSessionCache(raw, '42', later, SESSION_CACHE_MAX_STALE_MS)).toEqual(restored);
  });

  it('ignores malformed or future-dated data', () => {
    expect(readSessionCache(undefined, '42', NOW)).toBeNull();
    expect(readSessionCache('x', '42', NOW)).toBeNull();
    expect(readSessionCache({ ...createSessionCache(session, NOW), version: 0 }, '42', NOW)).toBeNull();
    expect(readSessionCache({ ...createSessionCache(session, NOW), viewer: {} }, '42', NOW)).toBeNull();
    expect(
      readSessionCache({ ...createSessionCache(session, NOW), viewer: { ...profile, id: '7' } }, '42', NOW),
    ).toBeNull();
    expect(readSessionCache(createSessionCache(session, NOW + 1000), '42', NOW)).toBeNull();
  });
});

describe('createCookieSession', () => {
  it('builds a session from the account and csrf cookies, without profile data', () => {
    expect(createCookieSession('csrftoken=tok; ds_user_id=42')).toEqual({
      config: { viewerId: '42', csrf_token: 'tok' },
    });
  });

  it('returns null when either cookie is missing', () => {
    expect(createCookieSession('ds_user_id=42')).toBeNull();
    expect(createCookieSession('csrftoken=tok')).toBeNull();
  });

  it('is never saved', () => {
    const cookieOnly = createCookieSession('csrftoken=tok; ds_user_id=42')!;
    expect(createSessionCache(cookieOnly, NOW)).toBeNull();
  });
});

describe('readLoggedInUserId', () => {
  it('reads ds_user_id from the cookie string', () => {
    expect(readLoggedInUserId('csrftoken=abc; ds_user_id=42; mid=x')).toBe('42');
    expect(readLoggedInUserId('ds_user_id=42')).toBe('42');
  });

  it('returns null when the cookie is missing or not an id', () => {
    expect(readLoggedInUserId('csrftoken=abc')).toBeNull();
    expect(readLoggedInUserId('ds_user_id=')).toBeNull();
    expect(readLoggedInUserId('ds_user_id=abc')).toBeNull();
    expect(readLoggedInUserId('my_ds_user_id=42')).toBeNull();
  });
});
