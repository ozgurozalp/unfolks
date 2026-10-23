import { toViewerProfile, type ViewerProfile } from './shared-types';

/**
 * The part of Instagram's shared data the extension uses. `viewer` (name,
 * photo) is missing when the session was built from cookies alone.
 */
export interface InstagramSession {
  config: {
    viewerId: string;
    /** Fallback only: requests read the token from the `csrftoken` cookie first. */
    csrf_token: string;
    viewer?: ViewerProfile;
  };
}

export const SESSION_CACHE_VERSION = 1;
/** Within this age the saved session is used without asking Instagram again. */
export const SESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** An older session is still used when Instagram refuses the request (rate limit, outage). */
export const SESSION_CACHE_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What is saved on the computer: the account id and the profile card fields.
 * No tokens; the CSRF token is read from the cookie on every request.
 */
export interface CachedSession {
  version: typeof SESSION_CACHE_VERSION;
  viewerId: string;
  savedAt: number;
  viewer: ViewerProfile;
}

/** Null for a session without profile data, which is not worth saving. */
export function createSessionCache(session: InstagramSession, now: number): CachedSession | null {
  const { viewerId, viewer } = session.config;
  if (!viewer) return null;
  return { version: SESSION_CACHE_VERSION, viewerId, savedAt: now, viewer: toViewerProfile(viewer) };
}

/**
 * Return the saved session when it belongs to `viewerId` and is younger than
 * `maxAgeMs`. Anything malformed counts as no session.
 */
export function readSessionCache(
  raw: unknown,
  viewerId: string,
  now: number,
  maxAgeMs: number = SESSION_CACHE_TTL_MS,
): InstagramSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<CachedSession>;
  if (value.version !== SESSION_CACHE_VERSION || value.viewerId !== viewerId) return null;
  if (typeof value.savedAt !== 'number' || now - value.savedAt > maxAgeMs || value.savedAt > now) return null;

  const viewer = value.viewer;
  if (!viewer || typeof viewer !== 'object' || viewer.id !== viewerId || typeof viewer.username !== 'string') {
    return null;
  }
  return { config: { viewerId, csrf_token: '', viewer: toViewerProfile(viewer) } };
}

function readCookie(cookie: string, name: string): string {
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return '';
  }
}

/** The logged-in account id from Instagram's `ds_user_id` cookie, or null when it is missing. */
export function readLoggedInUserId(cookie: string): string | null {
  const id = readCookie(cookie, 'ds_user_id');
  return /^\d+$/.test(id) ? id : null;
}

/**
 * A session built from cookies alone, for when Instagram refuses the session
 * request and nothing is saved. Scanning and unfollowing work; the profile
 * card stays empty. Null when either cookie is missing.
 */
export function createCookieSession(cookie: string): InstagramSession | null {
  const viewerId = readLoggedInUserId(cookie);
  const csrfToken = readCookie(cookie, 'csrftoken');
  if (!viewerId || !csrfToken) return null;
  return { config: { viewerId, csrf_token: csrfToken } };
}
