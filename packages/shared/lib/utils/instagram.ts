import type { InstagramSharedData, ScanProgress, ScanStopReason, User } from '.';
import { t } from '@extension/i18n';
import {
  classifyIgFailure,
  classifyNonJson,
  compactFriendshipUser,
  computeUnfollowers,
  dedupeFriendshipUsers,
  extractGraphqlTokens,
  followersPageOutcome,
  followersWalkLooksComplete,
  getFriendshipUserId,
  graphqlErrorMessage,
  graphqlUnfollowOutcome,
  indexFollowBackAliases,
  inlineFollowBackIds,
  isGraphqlUnfollowBlocked,
  isRetryableIgFail,
  jazoestFromDtsg,
  mapFollowingToUsers,
  matchCanonicalFollowBack,
  MAX_EMPTY_PAGES,
  nextPageStep,
  randomBetween,
  readShowManyFollowedBy,
  shouldPreferShowMany,
  showManyReportsFollowedBy,
  UNFOLLOW_DOC_ID,
  UNFOLLOW_FRIENDLY_NAME,
  usersUnconfirmedFollowBack,
  type FriendshipUser,
  type GraphqlTokens,
} from './instagram-utils';
import { SCAN_PACING, type ScanPacing } from './pacing';
import { createCheckpoint, SCAN_COOLDOWN_MS, type ScanCheckpoint } from './scan-checkpoint';
import type { InstagramSession } from './session-cache';

const IG_WEB_APP_ID = '936619743392459';
const FRIENDSHIP_PAGE_SIZE = 200;
/** `show_many` accepts about 100 ids. One POST replaces that many `show/{id}` calls. */
const SHOW_MANY_BATCH = 100;
const SHOW_MANY_GAP_MIN_MS = 40;
const SHOW_MANY_GAP_MAX_MS = 120;
/** Observed followers page size: the endpoint ignores `count` and sends ~23 users. */
const FOLLOWERS_PAGE_SIZE = 23;
/** About a thousand followers. Cheaper to intersect the list than to call show_many. */
const CHEAP_FOLLOWER_PAGES = 40;
/** Retries for 5xx and transient `status: fail` bodies. */
const MAX_RETRIES = 3;
/**
 * A rate limit is waited out a few times (about two minutes in total), then
 * the scan stops and keeps its progress. Pushing on is how accounts get flagged.
 */
const MAX_RATE_RETRIES = 4;
const MAX_RATE_WAIT_MS = 60_000;
const BACKOFF_BASE_MS = 2000;
/** After failing to read session tokens, wait this long before fetching the home page again. */
const TOKEN_RETRY_MS = 60_000;
/** Saved "does not follow back" answers older than this are asked again on Resume. */
const STALE_ANSWER_MS = 30 * 60 * 1000;
/** How many scan events the log keeps. */
const MAX_LOG_LINES = 40;
/** The checkpoint is handed out at most this often while a scan runs. */
const CHECKPOINT_EMIT_MS = 4000;
/** Local cooldown enforced after Instagram soft-blocks an action. */
export const ACTION_BLOCK_COOLDOWN_MS = 15 * 60 * 1000;

type ProgressCallback = (progress: ScanProgress) => void;

interface FriendshipsPage {
  users?: FriendshipUser[];
  next_max_id?: string | null;
  has_more?: boolean;
  should_limit_list_of_followers?: boolean;
  should_limit_list_of_followings?: boolean;
  status?: string;
  message?: string;
}

export interface ScanResult {
  users: User[];
  /** Accounts that could not be verified were left out of `users`, or the following list ended early. */
  incomplete: boolean;
}

export interface ScanOptions {
  pacing?: ScanPacing;
  /** Continue from this saved progress instead of starting over. */
  resume?: ScanCheckpoint | null;
  onProgress?: ProgressCallback;
  /** Receives the latest progress every few seconds while the scan runs. */
  onCheckpoint?: (checkpoint: ScanCheckpoint) => void;
  /** Aborting stops the scan at once, mid-request or mid-wait, and keeps its progress. */
  signal?: AbortSignal;
}

/** The last thing Instagram answered when a request failed, for the error line. */
export interface LastHttpFailure {
  status: number;
  message: string;
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

/** Instagram pushed back; the scan stops and keeps its progress for Resume. */
export class ScanStoppedError extends Error {
  reason: ScanStopReason;
  cooldownMs: number;
  constructor(reason: ScanStopReason, message: string) {
    super(message);
    this.name = 'ScanStoppedError';
    this.reason = reason;
    this.cooldownMs = SCAN_COOLDOWN_MS[reason];
  }
}

/** The user stopped the scan. Unlike ScanStoppedError there is no wait before trying again. */
export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled');
    this.name = 'ScanCancelledError';
  }
}

/** The unfollow block, with the time left on it. */
export function actionBlockedError(cooldownMs: number): ActionBlockedError {
  return new ActionBlockedError(t('actionBlocked'), cooldownMs);
}

/** The panel's list was scanned with a different account than the one logged in here. */
export class AccountMismatchError extends Error {
  constructor() {
    super(t('accountMismatch'));
    this.name = 'AccountMismatchError';
  }
}

export function scanStopMessage(reason: ScanStopReason): string {
  if (reason === 'rate') return t('scanRateLimited');
  if (reason === 'blocked') return t('scanBlocked');
  if (reason === 'limited') return t('scanLimitedList');
  if (reason === 'gap') return t('scanEmptyPages');
  return t('scanFailed');
}

export class Instagram {
  sharedData: InstagramSession;
  /** The scan's progress; read it after a failure to save it for Resume. */
  checkpoint: ScanCheckpoint | null = null;
  lastHttp: LastHttpFailure | null = null;
  /** The latest scan events (failures, waits), kept for the "send logs" report. */
  readonly log: string[] = [];
  private signal?: AbortSignal;
  private pacing: ScanPacing = SCAN_PACING.fast;
  private graphqlTokens: GraphqlTokens | null | undefined;
  /** When reading tokens last failed; the home page is not fetched again for a minute. */
  private graphqlTokensMissAt = 0;
  private scanProgress?: ProgressCallback;
  private emitCheckpoint?: (checkpoint: ScanCheckpoint) => void;
  private lastCheckpointEmit = 0;
  private lastProgress: ScanProgress | null = null;

  constructor(sharedData: InstagramSession) {
    this.sharedData = sharedData;
  }

  get viewerId(): string {
    return this.sharedData.config.viewerId;
  }

  get progress(): ScanProgress | null {
    return this.lastProgress;
  }

  async getPeople(options: ScanOptions = {}): Promise<ScanResult> {
    this.pacing = options.pacing ?? SCAN_PACING.fast;
    this.scanProgress = progress => {
      this.lastProgress = progress;
      options.onProgress?.(progress);
    };
    this.emitCheckpoint = options.onCheckpoint;
    this.signal = options.signal;
    this.lastProgress = null;
    this.lastHttp = null;
    this.checkpoint = options.resume ? this.prepareResume(options.resume) : createCheckpoint(this.viewerId, Date.now());

    try {
      await this.collectFollowing();
      return await this.resolveFollowBack();
    } catch (error) {
      // An aborted fetch rejects with an AbortError; the caller only needs to know it was a cancel.
      if (this.signal?.aborted) throw new ScanCancelledError();
      throw error;
    } finally {
      this.scanProgress = undefined;
      this.emitCheckpoint = undefined;
      this.signal = undefined;
    }
  }

  /**
   * Someone may have followed back while the scan waited, so old "does not
   * follow back" answers are asked again. Old "follows back" answers stay:
   * at worst they hide a non-follower, never list a follower.
   */
  private prepareResume(resume: ScanCheckpoint): ScanCheckpoint {
    const stale = Date.now() - resume.savedAt > STALE_ANSWER_MS;
    return {
      ...resume,
      followingEmptyRun: 0,
      cooldownUntil: 0,
      stopReason: undefined,
      notFollowBackIds: stale ? [] : resume.notFollowBackIds,
    };
  }

  async unFollow(user: User): Promise<{ status: true; deletedId: string }> {
    const outcome = await this.unFollowViaGraphql(user);
    if (outcome === 'blocked') throw new ActionBlockedError(t('actionBlocked'));
    if (outcome === 'confirmed') return { status: true, deletedId: user.id };

    if (outcome === 'unconfirmed') {
      // Instagram said ok without saying the follow is gone. Look it up; an
      // unknown is never counted as a success.
      const stillFollowing = await this.isStillFollowing(user);
      if (stillFollowing === false) return { status: true, deletedId: user.id };
    }

    throw new Error(t('unfollowFailed'));
  }

  private updateCheckpoint(patch: Partial<ScanCheckpoint>): ScanCheckpoint {
    const base = this.checkpoint ?? createCheckpoint(this.viewerId, Date.now());
    const next = { ...base, ...patch, savedAt: Date.now() };
    this.checkpoint = next;

    if (this.emitCheckpoint && next.savedAt - this.lastCheckpointEmit >= CHECKPOINT_EMIT_MS) {
      this.lastCheckpointEmit = next.savedAt;
      this.emitCheckpoint(next);
    }
    return next;
  }

  private reportFollowing(loaded: number) {
    const estimate = Math.max(this.checkpoint?.followingTotal ?? 0, loaded);
    this.scanProgress?.({ phase: 'following', current: loaded, total: estimate * 2 });
  }

  private async collectFollowing(): Promise<void> {
    let checkpoint = this.checkpoint ?? createCheckpoint(this.viewerId, Date.now());
    if (checkpoint.followingTotal === null && checkpoint.followersTotal === null) {
      const counts = await this.getProfileCounts();
      checkpoint = this.updateCheckpoint({ followingTotal: counts.following, followersTotal: counts.followers });
    }
    if (checkpoint.followingDone) return;

    let maxId = checkpoint.followingCursor;
    let page = 0;
    this.reportFollowing(checkpoint.following.length);

    for (;;) {
      const data = await this.requestJson<FriendshipsPage>(this.friendshipListUrl('following', maxId), 'following');
      if (data.should_limit_list_of_followings === true) {
        throw new ScanStoppedError('limited', scanStopMessage('limited'));
      }

      const pageUsers = (data.users ?? []).map(compactFriendshipUser);
      const following = dedupeFriendshipUsers([...(this.checkpoint?.following ?? []), ...pageUsers]);
      const step = nextPageStep({
        nextMaxId: data.next_max_id,
        pageLength: pageUsers.length,
        prevMaxId: maxId,
        emptyRun: this.checkpoint?.followingEmptyRun ?? 0,
        hasMore: data.has_more,
      });
      page += 1;

      if (step.kind === 'tooManyEmpty') {
        this.updateCheckpoint({ following, followingEmptyRun: MAX_EMPTY_PAGES });
        throw new ScanStoppedError('gap', scanStopMessage('gap'));
      }

      if (step.kind === 'continue') {
        maxId = data.next_max_id as string;
        this.updateCheckpoint({ following, followingCursor: maxId, followingEmptyRun: step.emptyRun });
        this.reportFollowing(following.length);
        await this.pacePage(page);
        continue;
      }

      // A repeated cursor, or "more" without a cursor, ends the list here. In
      // the following list that can only hide non-followers, never add a follower.
      this.updateCheckpoint({
        following,
        followingCursor: undefined,
        followingDone: true,
        followingGap: step.kind === 'stuck',
      });
      this.reportFollowing(following.length);
      break;
    }

    const total = this.checkpoint?.followingTotal ?? 0;
    if ((this.checkpoint?.following.length ?? 0) === 0 && total > 0) {
      throw new Error('Following list could not be loaded');
    }
  }

  /**
   * Decide who follows back. Results land in the checkpoint as they arrive,
   * so a stopped scan does not ask Instagram about the same accounts again.
   */
  private async resolveFollowBack(): Promise<ScanResult> {
    const checkpoint = this.checkpoint ?? createCheckpoint(this.viewerId, Date.now());
    const { following } = checkpoint;
    const followingCount = following.length;
    const total = followingCount * 2;

    const known = new Set([...checkpoint.followBackIds, ...checkpoint.notFollowBackIds]);
    for (const id of inlineFollowBackIds(following)) known.add(id);
    const missing = usersUnconfirmedFollowBack(following).filter(user => !known.has(getFriendshipUserId(user)));

    const finish = (assumeFollowBack: readonly FriendshipUser[]): ScanResult => {
      this.scanProgress?.({ phase: 'followers', current: total, total });
      const latest = this.checkpoint ?? checkpoint;
      const followBackIds = new Set([
        ...latest.followBackIds,
        ...inlineFollowBackIds(following),
        // Unknown accounts stay off the list rather than risk unfollowing a follower.
        ...assumeFollowBack.map(getFriendshipUserId),
      ]);
      return {
        users: computeUnfollowers(mapFollowingToUsers(following, followBackIds)),
        incomplete: assumeFollowBack.length > 0 || latest.followingGap,
      };
    };
    const report = (done: number) => this.scanProgress?.({ phase: 'followers', current: followingCount + done, total });

    if (missing.length === 0) return finish([]);
    report(followingCount - missing.length);

    const followersCount = checkpoint.followersTotal;
    const followerPages =
      followersCount === null ? Number.POSITIVE_INFINITY : Math.ceil(followersCount / FOLLOWERS_PAGE_SIZE);
    const walkFollowers = followerPages <= CHEAP_FOLLOWER_PAGES;
    const alreadyKnown = followingCount - missing.length;
    let triedShowMany = false;

    if (!walkFollowers && shouldPreferShowMany(followersCount, missing.length, FOLLOWERS_PAGE_SIZE, SHOW_MANY_BATCH)) {
      triedShowMany = true;
      if (await this.confirmWithShowMany(missing, done => report(alreadyKnown + done))) return finish([]);
    }

    const stillMissing = this.unresolved(missing);
    const walk = await this.collectFollowBackFromFollowers(stillMissing, found => report(alreadyKnown + found));
    if (walk.complete) {
      // The whole followers list was read: whoever was not in it does not follow back.
      const notFollowBack = this.unresolved(stillMissing).map(getFriendshipUserId);
      this.updateCheckpoint({
        notFollowBackIds: [...(this.checkpoint?.notFollowBackIds ?? []), ...notFollowBack],
      });
      return finish([]);
    }

    // The walk stopped early. Ask about the rest directly before giving up on them.
    const unresolved = this.unresolved(stillMissing);
    if (!triedShowMany && (await this.confirmWithShowMany(unresolved, done => report(alreadyKnown + done)))) {
      return finish([]);
    }

    return finish(this.unresolved(unresolved));
  }

  /** Accounts whose follow-back status is still unknown. */
  private unresolved(users: readonly FriendshipUser[]): FriendshipUser[] {
    const checkpoint = this.checkpoint;
    if (!checkpoint) return [...users];
    const known = new Set([...checkpoint.followBackIds, ...checkpoint.notFollowBackIds]);
    return users.filter(user => !known.has(getFriendshipUserId(user)));
  }

  private recordFollowBack(followBack: readonly string[], notFollowBack: readonly string[]) {
    const checkpoint = this.checkpoint;
    this.updateCheckpoint({
      followBackIds: [...(checkpoint?.followBackIds ?? []), ...followBack],
      notFollowBackIds: [...(checkpoint?.notFollowBackIds ?? []), ...notFollowBack],
    });
  }

  private async postForm(path: string, fields: Record<string, string>, extraHeaders: Record<string, string> = {}) {
    return fetch(path, {
      headers: {
        ...this.igHeaders(),
        'content-type': 'application/x-www-form-urlencoded',
        ...extraHeaders,
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      body: new URLSearchParams(fields),
      signal: this.signal,
    });
  }

  private igHeaders() {
    return {
      'x-ig-app-id': IG_WEB_APP_ID,
      'x-csrftoken': document.cookie.match(/(?:^|; )csrftoken=([^;]*)/)?.[1] || this.sharedData.config.csrf_token,
      'x-requested-with': 'XMLHttpRequest',
      'x-instagram-ajax': '1',
    };
  }

  /**
   * GraphQL writes carry per-session tokens. They come from the page's inline
   * data; when the content script finds none there, a fresh copy of the home
   * page has them.
   */
  private async readGraphqlTokens(): Promise<GraphqlTokens | null> {
    if (this.graphqlTokens) return this.graphqlTokens;
    if (typeof document === 'undefined') return null;
    if (Date.now() - this.graphqlTokensMissAt < TOKEN_RETRY_MS) return null;

    const scripts = document.querySelectorAll('script');
    const chunks: string[] = [];
    for (let i = 0; i < scripts.length; i += 1) {
      const text = scripts[i].textContent;
      if (text && (text.includes('DTSG') || text.includes('LSD') || text.includes('asbd'))) {
        chunks.push(text);
      }
    }

    let tokens = extractGraphqlTokens(chunks.join('\n'));
    if (!tokens) {
      try {
        const response = await fetch('/', { credentials: 'include' });
        tokens = extractGraphqlTokens(await response.text());
      } catch {
        tokens = null;
      }
    }
    this.graphqlTokens = tokens;
    if (!tokens) this.graphqlTokensMissAt = Date.now();
    return tokens;
  }

  /** Unfollow the way instagram.com's own button does (`usePolarisUnfollowMutation`). */
  private async unFollowViaGraphql(user: User): Promise<'confirmed' | 'unconfirmed' | 'blocked' | 'failed'> {
    const tokens = await this.readGraphqlTokens();
    if (!tokens) return 'failed';

    const actorId = this.sharedData.config.viewer?.fbid || this.sharedData.config.viewerId;
    const headers: Record<string, string> = {
      'x-fb-friendly-name': UNFOLLOW_FRIENDLY_NAME,
      'x-fb-lsd': tokens.lsd,
    };
    if (tokens.asbdId) headers['x-asbd-id'] = tokens.asbdId;

    let response: Response;
    try {
      response = await this.postForm(
        'https://www.instagram.com/api/graphql',
        {
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
          variables: JSON.stringify({ target_user_id: user.id, container_module: 'profile' }),
          doc_id: UNFOLLOW_DOC_ID,
        },
        headers,
      );
    } catch {
      return 'failed';
    }

    let payload: unknown = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const kind = classifyIgFailure(response.status, payload);
      if (kind === 'auth') throw new AuthenticationError(t('authError'));
      if (kind === 'rate' || kind === 'blocked') return 'blocked';
      return 'failed';
    }

    if (isGraphqlUnfollowBlocked(response.status, payload)) return 'blocked';
    const outcome = graphqlUnfollowOutcome(payload);
    if (outcome === 'failed' && graphqlErrorMessage(payload)) {
      // A stale session token: read fresh ones on the next attempt.
      this.graphqlTokens = undefined;
    }
    return outcome;
  }

  /** Ask Instagram directly whether the viewer still follows this account. Null when the lookup fails. */
  private async isStillFollowing(user: User): Promise<boolean | null> {
    try {
      const response = await fetch(
        `https://www.instagram.com/api/v1/friendships/show/${encodeURIComponent(user.id)}/`,
        {
          headers: this.igHeaders(),
          credentials: 'include',
        },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as {
        status?: string;
        following?: unknown;
        friendship_status?: { following?: unknown };
      };
      if (data.status && data.status !== 'ok') return null;
      const following = typeof data.following === 'boolean' ? data.following : data.friendship_status?.following;
      return typeof following === 'boolean' ? following : null;
    } catch {
      return null;
    }
  }

  /**
   * Batched friendship lookup. Returns false when `followed_by` is missing or a
   * request fails, so the caller can walk the followers list instead.
   */
  private async confirmWithShowMany(users: FriendshipUser[], onDone?: (done: number) => void): Promise<boolean> {
    let done = 0;

    for (let i = 0; i < users.length; i += SHOW_MANY_BATCH) {
      const chunk = users.slice(i, i + SHOW_MANY_BATCH);
      const flags = await this.fetchShowManyFlags(chunk.map(user => getFriendshipUserId(user)));
      if (!flags) return false;

      const followBack: string[] = [];
      const notFollowBack: string[] = [];
      for (const user of chunk) {
        const id = getFriendshipUserId(user);
        if (flags.has(id) && flags.get(id) === false) notFollowBack.push(id);
        else followBack.push(id);
      }
      this.recordFollowBack(followBack, notFollowBack);

      done += chunk.length;
      onDone?.(done);
      if (i + SHOW_MANY_BATCH < users.length) {
        await this.wait(randomBetween(SHOW_MANY_GAP_MIN_MS, SHOW_MANY_GAP_MAX_MS));
      }
    }

    return true;
  }

  private async fetchShowManyFlags(userIds: string[]): Promise<Map<string, boolean | undefined> | null> {
    let payload: unknown;
    try {
      payload = await this.requestJson<{ status?: string; message?: string }>(
        'https://www.instagram.com/api/v1/friendships/show_many/',
        'show_many',
        { user_ids: userIds.join(',') },
      );
    } catch (error) {
      // A rate limit or sign-out must stop the scan, not fall through to paging every follower.
      if (error instanceof AuthenticationError || error instanceof ScanStoppedError) throw error;
      return null;
    }

    const flags = readShowManyFollowedBy(payload);
    if (!flags || !showManyReportsFollowedBy(flags)) return null;
    return flags;
  }

  /**
   * Walk the viewer's followers list and mark which of `users` appear in it.
   * When `complete` is false the walk stopped early, so a missing id is unknown.
   */
  private async collectFollowBackFromFollowers(
    users: readonly FriendshipUser[],
    onConfirm?: (confirmed: number) => void,
  ): Promise<{ complete: boolean }> {
    const aliasToCanonical = indexFollowBackAliases(users);
    const canonicalCount = new Set(aliasToCanonical.values()).size;
    const confirmed = new Set<string>();
    let maxId: string | undefined;
    let pages = 0;
    let emptyRun = 0;
    let seen = 0;

    for (;;) {
      let data: FriendshipsPage;
      try {
        data = await this.requestJson<FriendshipsPage>(this.friendshipListUrl('followers', maxId), 'followers');
      } catch (error) {
        if (error instanceof AuthenticationError || error instanceof ScanStoppedError) throw error;
        return { complete: false };
      }
      if (data.should_limit_list_of_followers === true) return { complete: false };

      const pageUsers = data.users ?? [];
      seen += pageUsers.length;
      const found: string[] = [];
      for (const user of pageUsers) {
        const canonical = matchCanonicalFollowBack(user, aliasToCanonical);
        if (canonical && !confirmed.has(canonical)) {
          confirmed.add(canonical);
          found.push(canonical);
        }
      }
      if (found.length) this.recordFollowBack(found, []);

      pages += 1;
      onConfirm?.(confirmed.size);
      if (canonicalCount > 0 && confirmed.size === canonicalCount) return { complete: true };

      const step = nextPageStep({
        nextMaxId: data.next_max_id,
        pageLength: pageUsers.length,
        prevMaxId: maxId,
        emptyRun,
        hasMore: data.has_more,
      });
      if (step.kind === 'end') {
        // A missing cursor ends the walk, but a short list is not proof that someone does not follow back.
        const ended = followersPageOutcome(data.next_max_id, pageUsers.length, maxId) === 'complete';
        return { complete: ended && followersWalkLooksComplete(seen, this.checkpoint?.followersTotal ?? null) };
      }
      // A gap in the followers list could make a follower look like a non-follower.
      if (step.kind !== 'continue') return { complete: false };

      emptyRun = step.emptyRun;
      maxId = data.next_max_id as string;
      await this.pacePage(pages);
    }
  }

  private friendshipListUrl(list: 'following' | 'followers', maxId?: string): string {
    const url = new URL(`https://www.instagram.com/api/v1/friendships/${this.viewerId}/${list}/`);
    url.searchParams.set('count', String(FRIENDSHIP_PAGE_SIZE));
    url.searchParams.set('search_surface', 'follow_list_page');
    // Without an explicit order Instagram returns its "Default" ranking, which
    // breaks the follow-recency sort that relies on list position.
    if (list === 'following') url.searchParams.set('order', 'date_followed_latest');
    if (maxId) url.searchParams.set('max_id', maxId);
    return url.toString();
  }

  /** Sleep that ends early, with a cancel, when the scan is aborted. */
  private wait(ms: number): Promise<void> {
    const { signal } = this;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ScanCancelledError());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new ScanCancelledError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private note(line: string) {
    this.log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
    if (this.log.length > MAX_LOG_LINES) this.log.splice(0, this.log.length - MAX_LOG_LINES);
  }

  private async pacePage(page: number) {
    const pacing = this.pacing;
    if (page <= pacing.fastPages) {
      await this.wait(randomBetween(pacing.fastDelayMinMs, pacing.fastDelayMaxMs));
      return;
    }
    if (pacing.pauseEveryPages > 0 && page % pacing.pauseEveryPages === 0) {
      await this.wait(pacing.pauseMs + randomBetween(0, Math.max(1, Math.round(pacing.pauseMs * 0.3))));
      return;
    }
    await this.wait(randomBetween(pacing.delayMinMs, pacing.delayMaxMs));
  }

  private remember(status: number, body: unknown) {
    const record = body && typeof body === 'object' ? (body as { message?: unknown; error_type?: unknown }) : {};
    const message = [record.message, record.error_type].find(value => typeof value === 'string');
    this.lastHttp = { status, message: typeof message === 'string' ? message.slice(0, 120) : '' };
    this.note(`HTTP ${this.lastHttp.status}${this.lastHttp.message ? ` "${this.lastHttp.message}"` : ''}`);
  }

  /**
   * GET (or POST when `form` is given) JSON from Instagram. Rate limits are
   * waited out a few times, then stop the scan; blocks stop it at once.
   */
  private async requestJson<T extends { status?: string; message?: string }>(
    url: string,
    label: string,
    form?: Record<string, string>,
  ): Promise<T> {
    let rateAttempts = 0;

    for (let attempt = 0; ; attempt += 1) {
      const response = form
        ? await this.postForm(url, form)
        : await fetch(url, { headers: this.igHeaders(), credentials: 'include', signal: this.signal });

      const text = await response.text();
      let body: unknown;
      let parsed = text.trim().length > 0;
      try {
        body = parsed ? JSON.parse(text) : undefined;
      } catch {
        parsed = false;
      }

      if (response.ok && !parsed) {
        // Only a redirect to the login or challenge page means more than a failed request.
        const page = classifyNonJson(text, response.url, response.redirected);
        this.lastHttp = { status: response.status, message: page.summary };
        if (page.kind === 'auth') throw new AuthenticationError(t('authError'));
        if (page.kind === 'blocked') throw new ScanStoppedError('blocked', scanStopMessage('blocked'));
        throw new Error(t('scanFailed'));
      }

      const data = (body ?? {}) as T;
      const failed = !response.ok || (data.status !== undefined && data.status !== 'ok');
      if (!failed) return data;

      this.remember(response.status, body);
      const kind = classifyIgFailure(response.status, body);

      if (kind === 'blocked') throw new ScanStoppedError('blocked', scanStopMessage('blocked'));
      if (kind === 'rate') {
        if (rateAttempts >= MAX_RATE_RETRIES) throw new ScanStoppedError('rate', scanStopMessage('rate'));
        await this.waitForRetry(response, rateAttempts);
        rateAttempts += 1;
        continue;
      }
      if (kind === 'auth') throw new AuthenticationError(t('authError'));

      const transient = response.status >= 500 || (response.ok && isRetryableIgFail(data));
      if (transient && attempt < MAX_RETRIES) {
        await this.waitForRetry(response, attempt);
        continue;
      }
      throw new Error(data.message || `Failed to fetch ${label} (${response.status})`);
    }
  }

  private async getProfileCounts(): Promise<ProfileCounts> {
    try {
      const response = await fetch(`https://www.instagram.com/api/v1/users/${this.viewerId}/info/`, {
        headers: this.igHeaders(),
        credentials: 'include',
        signal: this.signal,
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

  private async waitForRetry(response: Response, attempt: number) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const backoff = Math.min(MAX_RATE_WAIT_MS, Math.max(8000, BACKOFF_BASE_MS * 2 ** (attempt + 2)));
    const wait = retryAfter > 0 ? Math.min(MAX_RATE_WAIT_MS, retryAfter * 1000) : backoff;
    this.note(`waiting ${Math.round(wait / 1000)}s before retry ${attempt + 1}`);
    this.notifyRateLimit(wait);
    await this.wait(wait + randomBetween(0, 1000));
  }

  private notifyRateLimit(waitMs: number) {
    const previous = this.lastProgress;
    this.scanProgress?.({
      phase: previous?.phase ?? 'following',
      current: previous?.current ?? 0,
      total: previous?.total ?? 0,
      retryInMs: waitMs,
    });
  }
}

export async function getSharedData(): Promise<InstagramSharedData | undefined> {
  if (!location.href.includes('instagram.com')) return;

  const res = await fetch('/data/shared_data/');

  if (res.status === 401 || res.status === 403) {
    throw new AuthenticationError(t('authError'));
  }
  // A rate limit or outage is not a logout; the caller may fall back to a saved session.
  if (!res.ok) throw new Error(`Failed to load Instagram session (${res.status})`);

  const data = (await res.json()) as InstagramSharedData;
  // Logged out: shared data still loads, but without a viewer.
  if (!data?.config?.viewerId || !data.config.viewer) {
    throw new AuthenticationError(t('authError'));
  }
  return data;
}
