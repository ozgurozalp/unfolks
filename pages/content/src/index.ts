import {
  AccountMismatchError,
  ActionBlockedError,
  actionBlockedError,
  AuthenticationError,
  captureException,
  createCookieSession,
  createSessionCache,
  getSharedData,
  hasProgress,
  Instagram,
  isSameViewer,
  markStopped,
  readCheckpoint,
  readLoggedInUserId,
  readSessionCache,
  SCAN_PACING,
  SESSION_CACHE_MAX_STALE_MS,
  toViewerProfile,
  scanStopMessage,
  resolveScanSpeed,
  ScanStoppedError,
  summarizeCheckpoint,
  TYPES,
  withoutAccount,
  type InstagramSession,
  type Request,
  type ScanCheckpoint,
  type ScanProgress,
  type ScanStopReason,
  type User,
  type ViewerProfile,
} from '@extension/shared';
import { sendMessageToBackground } from '@src/lib/utils';

/** The last loaded Instagram session, reused while the same account stays logged in. */
const SESSION_KEY = 'unfolks-session';

/** One checkpoint per Instagram account, so switching accounts keeps each one's wait. */
const checkpointKey = (viewerId: string) => `unfolks-scan-checkpoint:${viewerId}`;

let viewer: ViewerProfile | undefined;
let setup: Promise<Instagram> | null = null;
let scanning = false;
let lastProgress: ScanProgress | null = null;
let rateLimitUntil = 0;

function send(message: Request) {
  sendMessageToBackground(message).catch(console.error);
}

function pushProgress(progress: ScanProgress) {
  rateLimitUntil = progress.retryInMs && progress.retryInMs > 0 ? Date.now() + progress.retryInMs : 0;
  lastProgress = progress;
  send({
    type: TYPES.PROGRESS,
    phase: progress.phase,
    current: progress.current,
    total: progress.total,
    retryInMs: progress.retryInMs,
    // Chrome slows timers in background tabs down to about one step a minute.
    tabHidden: document.visibilityState === 'hidden',
  });
}

function pushScanState() {
  if (!scanning) return;
  const base = lastProgress ?? { phase: 'following', current: 0, total: 0 };
  const remaining = rateLimitUntil - Date.now();
  pushProgress({ ...base, retryInMs: remaining > 0 ? remaining : undefined });
}

document.addEventListener('visibilitychange', () => {
  if (scanning) pushScanState();
});

function pushViewer() {
  if (!viewer) return;
  send({ type: TYPES.SET_VIEWER_DATA, viewer });
}

async function readStoredSession(): Promise<unknown> {
  try {
    const stored = await chrome.storage.local.get(SESSION_KEY);
    return stored[SESSION_KEY];
  } catch (error) {
    console.error('Failed to read saved session', error);
    return undefined;
  }
}

async function storeSession(session: InstagramSession | null) {
  try {
    const cached = session ? createSessionCache(session, Date.now()) : null;
    if (cached) await chrome.storage.local.set({ [SESSION_KEY]: cached });
    else await chrome.storage.local.remove(SESSION_KEY);
  } catch (error) {
    console.error('Failed to save session', error);
  }
}

/**
 * The logged-in account's session. While the `ds_user_id` cookie still names
 * the account saved last time, the saved copy is used instead of asking
 * Instagram again, which runs into its rate limit on busy days.
 */
async function loadSession(): Promise<InstagramSession> {
  const userId = readLoggedInUserId(document.cookie);
  const stored = userId ? await readStoredSession() : undefined;
  const now = Date.now();

  if (userId) {
    const cached = readSessionCache(stored, userId, now);
    if (cached) return cached;
  }

  try {
    const sharedData = await getSharedData();
    if (!sharedData) throw new Error('Instagram session data is unavailable');
    const { viewerId, csrf_token: csrfToken, viewer: fullViewer } = sharedData.config;
    const session: InstagramSession = {
      config: { viewerId, csrf_token: csrfToken, viewer: toViewerProfile(fullViewer) },
    };
    await storeSession(session);
    return session;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      await storeSession(null);
      throw error;
    }
    // Rate limited or Instagram is down: an older copy of the same account still works.
    const stale = userId ? readSessionCache(stored, userId, now, SESSION_CACHE_MAX_STALE_MS) : null;
    if (stale) return stale;
    // Nothing saved: the cookies are enough to scan, only the profile card stays empty.
    const fromCookies = createCookieSession(document.cookie);
    if (fromCookies) return fromCookies;
    throw error;
  }
}

/**
 * Load the session once. A failed attempt is dropped so the next request tries
 * again, instead of leaving this tab unable to scan until it is reloaded.
 */
function ensureInstagram(): Promise<Instagram> {
  if (!setup) {
    const attempt = (async () => {
      const session = await loadSession();
      viewer = session.config.viewer;
      pushViewer();
      return new Instagram(session);
    })();
    setup = attempt;
    attempt.catch(() => {
      if (setup === attempt) setup = null;
    });
  }
  return setup;
}

// Being logged out is normal while browsing; it is reported when a scan or unfollow is requested.
ensureInstagram().catch(error => {
  if (!(error instanceof AuthenticationError)) captureException(error as Error);
});

async function loadCheckpoint(viewerId: string): Promise<ScanCheckpoint | null> {
  const key = checkpointKey(viewerId);
  try {
    const stored = await chrome.storage.local.get(key);
    const checkpoint = readCheckpoint(stored[key], viewerId, Date.now());
    // Expired or unreadable data is removed rather than left on the computer.
    if (!checkpoint && stored[key] !== undefined) await chrome.storage.local.remove(key);
    return checkpoint;
  } catch (error) {
    console.error('Failed to read scan checkpoint', error);
    return null;
  }
}

async function saveCheckpoint(checkpoint: ScanCheckpoint) {
  try {
    await chrome.storage.local.set({ [checkpointKey(checkpoint.viewerId)]: checkpoint });
  } catch (error) {
    console.error('Failed to save scan checkpoint', error);
  }
}

async function clearCheckpoint(viewerId: string) {
  try {
    await chrome.storage.local.remove(checkpointKey(viewerId));
  } catch (error) {
    console.error('Failed to clear scan checkpoint', error);
  }
}

async function pushCheckpointInfo() {
  try {
    const instagram = await ensureInstagram();
    const checkpoint = await loadCheckpoint(instagram.viewerId);
    const usable = checkpoint && (hasProgress(checkpoint) || checkpoint.cooldownUntil > Date.now());
    send({ type: TYPES.CHECKPOINT_INFO, checkpoint: usable ? summarizeCheckpoint(checkpoint) : null });
  } catch {
    // Signed out: the saved scan cannot be read for this account, but it is not gone either.
  }
}

/** One line for bug reports: version, where the scan stopped, and what Instagram sent. */
function describeFailure(instagram: Instagram, error: unknown): string {
  const parts = [`v${chrome.runtime.getManifest().version}`];
  const progress = instagram.progress;
  if (progress) parts.push(`${progress.phase} ${progress.current}/${progress.total}`);
  const http = instagram.lastHttp;
  if (http) parts.push(`HTTP ${http.status}${http.message ? ` "${http.message}"` : ''}`);
  else if (error instanceof Error && error.message) parts.push(error.message.slice(0, 120));
  return parts.join(' · ');
}

/** Every request gets an answer, so the panel never waits on a spinner forever. */
function reportFailure(error: unknown, user?: User, errorDetail?: string) {
  const deletedId = user?.id;

  if (error instanceof AuthenticationError) {
    send({ type: TYPES.AUTH_ERROR, errorMessage: error.message, deletedId });
    return;
  }

  if (error instanceof ActionBlockedError) {
    send({
      status: false,
      type: TYPES.ACTION_BLOCKED,
      user,
      deletedId,
      errorMessage: error.message,
      cooldownMs: error.cooldownMs,
    });
    return;
  }

  if (!user) captureException(error as Error);
  send({
    status: false,
    type: TYPES.ERROR,
    user,
    deletedId,
    errorMessage: error instanceof Error ? error.message : undefined,
    errorDetail,
  });
}

function stopReasonOf(error: unknown): ScanStopReason {
  if (error instanceof ScanStoppedError) return error.reason;
  if (error instanceof AuthenticationError) return 'auth';
  return 'error';
}

/** Keep the progress of a scan that stopped, and tell the panel it can resume. */
async function handleScanFailure(instagram: Instagram, error: unknown) {
  const errorDetail = describeFailure(instagram, error);
  const reason = stopReasonOf(error);
  const checkpoint = instagram.checkpoint;
  const keep = checkpoint && (hasProgress(checkpoint) || error instanceof ScanStoppedError);

  if (!checkpoint || !keep) {
    reportFailure(error, undefined, errorDetail);
    return;
  }

  const stopped = markStopped(checkpoint, reason, Date.now());
  await saveCheckpoint(stopped);
  if (reason === 'error') captureException(error as Error);

  send({
    type: TYPES.SCAN_STOPPED,
    stopReason: reason,
    errorMessage: error instanceof Error ? error.message : scanStopMessage('error'),
    errorDetail,
    checkpoint: summarizeCheckpoint(stopped),
  });
}

async function scan(request: Request) {
  if (scanning) {
    pushScanState();
    return;
  }

  scanning = true;
  let instagram: Instagram | null = null;
  try {
    instagram = await ensureInstagram();
    const saved = await loadCheckpoint(instagram.viewerId);

    // Asking Instagram again before the wait is over only gets refused, and can escalate.
    if (saved && saved.cooldownUntil > Date.now()) {
      send({
        type: TYPES.SCAN_STOPPED,
        stopReason: saved.stopReason ?? 'rate',
        errorMessage: scanStopMessage(saved.stopReason ?? 'rate'),
        checkpoint: summarizeCheckpoint(saved),
      });
      return;
    }

    const resume = request.resume && saved && hasProgress(saved) ? saved : null;
    if (!resume) await clearCheckpoint(instagram.viewerId);

    const { users, incomplete } = await instagram.getPeople({
      pacing: SCAN_PACING[resolveScanSpeed(request.scanSpeed)],
      resume,
      onProgress: pushProgress,
      onCheckpoint: checkpoint => void saveCheckpoint(checkpoint),
    });
    await clearCheckpoint(instagram.viewerId);
    send({ users, viewer, incomplete, type: TYPES.SET_PEOPLE });
  } catch (error) {
    if (instagram) await handleScanFailure(instagram, error);
    else reportFailure(error);
  } finally {
    scanning = false;
    lastProgress = null;
  }
}

async function unfollow(request: Request & { user: User }) {
  try {
    const instagram = await ensureInstagram();
    // The list may have been scanned with another account; this tab would unfollow from the current one.
    // Without profile data the account id from the cookie still identifies this account.
    const current = viewer ?? { id: instagram.viewerId, username: '' };
    if (request.expectedViewer && !isSameViewer(request.expectedViewer, current)) {
      throw new AccountMismatchError();
    }

    // While Instagram is blocking this account, more actions only make it worse.
    const before = await loadCheckpoint(instagram.viewerId);
    if (before?.stopReason === 'blocked' && before.cooldownUntil > Date.now()) {
      throw actionBlockedError(before.cooldownUntil - Date.now());
    }

    const { status, deletedId } = await instagram.unFollow(request.user);
    send({ status, type: TYPES.UNFOLLOWED, user: request.user, deletedId });

    // An account unfollowed now must not come back from a resumed scan. A
    // running scan owns the checkpoint, so it is left alone then.
    if (scanning) return;
    const saved = await loadCheckpoint(instagram.viewerId);
    if (saved) await saveCheckpoint(withoutAccount(saved, request.user.id));
  } catch (error) {
    reportFailure(error, request.user);
  }
}

async function discardCheckpoint() {
  try {
    const instagram = await ensureInstagram();
    const saved = await loadCheckpoint(instagram.viewerId);
    // The wait after a rate limit outlives the saved progress.
    if (saved && saved.cooldownUntil > Date.now()) {
      await saveCheckpoint({ ...saved, following: [], followingCursor: undefined, followingDone: false });
    } else {
      await clearCheckpoint(instagram.viewerId);
    }
  } finally {
    await pushCheckpointInfo();
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  sendResponse({ reply: 'ok' });

  switch (request.type) {
    case TYPES.GET_VIEWER_DATA:
      pushViewer();
      return;
    case TYPES.GET_SCAN_STATE:
      pushScanState();
      return;
    case TYPES.GET_PEOPLE:
      void scan(request);
      return;
    case TYPES.UNFOLLOW:
      void unfollow(request);
      return;
    case TYPES.GET_CHECKPOINT:
      if (!scanning) void pushCheckpointInfo();
      return;
    case TYPES.DISCARD_CHECKPOINT:
      if (!scanning) void discardCheckpoint();
      return;
  }
});
