import {
  AccountMismatchError,
  ActionBlockedError,
  AuthenticationError,
  captureException,
  getSharedData,
  Instagram,
  isSameViewer,
  TYPES,
  type InstagramViewer,
  type Request,
  type ScanProgress,
  type User,
} from '@extension/shared';
import { sendMessageToBackground } from '@src/lib/utils';

let viewer: InstagramViewer | undefined;
let setup: Promise<Instagram> | null = null;
let scanning = false;
let lastProgress: ScanProgress | null = null;
let rateLimitUntil = 0;

function pushProgress(progress: ScanProgress) {
  if (progress.retryInMs && progress.retryInMs > 0) {
    rateLimitUntil = Date.now() + progress.retryInMs;
  } else {
    rateLimitUntil = 0;
  }
  lastProgress = progress;
  sendMessageToBackground({
    type: TYPES.PROGRESS,
    phase: progress.phase,
    current: progress.current,
    total: progress.total,
    retryInMs: progress.retryInMs,
  }).catch(console.error);
}

function pushScanState() {
  if (!scanning) return;
  const base = lastProgress ?? { phase: 'following', current: 0, total: 0 };
  const remaining = rateLimitUntil - Date.now();
  pushProgress({
    ...base,
    retryInMs: remaining > 0 ? remaining : undefined,
  });
}

function pushViewer() {
  if (!viewer) return;
  sendMessageToBackground({
    type: TYPES.SET_VIEWER_DATA,
    viewer,
  }).catch(console.error);
}

/**
 * Load the session once. A failed attempt is dropped so the next request tries
 * again, instead of leaving this tab unable to scan until it is reloaded.
 */
function ensureInstagram(): Promise<Instagram> {
  if (!setup) {
    const attempt = (async () => {
      const sharedData = await getSharedData();
      if (!sharedData) throw new Error('Instagram session data is unavailable');

      viewer = sharedData.config.viewer;
      pushViewer();
      return new Instagram(sharedData);
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

/** Every request gets an answer, so the panel never waits on a spinner forever. */
function reportFailure(error: unknown, user?: User) {
  const deletedId = user?.id;

  if (error instanceof AuthenticationError) {
    sendMessageToBackground({ type: TYPES.AUTH_ERROR, errorMessage: error.message, deletedId }).catch(console.error);
    return;
  }

  if (error instanceof ActionBlockedError) {
    sendMessageToBackground({
      status: false,
      type: TYPES.ACTION_BLOCKED,
      user,
      deletedId,
      errorMessage: error.message,
      cooldownMs: error.cooldownMs,
    }).catch(console.error);
    return;
  }

  if (!user) captureException(error as Error);
  sendMessageToBackground({
    status: false,
    type: TYPES.ERROR,
    user,
    deletedId,
    errorMessage: error instanceof Error ? error.message : undefined,
  }).catch(console.error);
}

async function scan() {
  if (scanning) {
    pushScanState();
    return;
  }

  scanning = true;
  try {
    const instagram = await ensureInstagram();
    const { users, incomplete } = await instagram.getPeople(pushProgress);
    sendMessageToBackground({
      users,
      viewer,
      incomplete,
      type: TYPES.SET_PEOPLE,
    }).catch(console.error);
  } catch (error) {
    reportFailure(error);
  } finally {
    scanning = false;
    lastProgress = null;
  }
}

async function unfollow(request: Request & { user: User }) {
  try {
    const instagram = await ensureInstagram();
    // The list may have been scanned with another account; this tab would unfollow from the current one.
    if (request.expectedViewer && viewer && !isSameViewer(request.expectedViewer, viewer)) {
      throw new AccountMismatchError();
    }

    const { status, deletedId } = await instagram.unFollow(request.user);
    sendMessageToBackground({
      status,
      type: status ? TYPES.UNFOLLOWED : TYPES.ERROR,
      user: request.user,
      deletedId,
    }).catch(console.error);
  } catch (error) {
    reportFailure(error, request.user);
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
      void scan();
      return;
    case TYPES.UNFOLLOW:
      void unfollow(request);
      return;
  }
});
