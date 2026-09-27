import {
  ActionBlockedError,
  AuthenticationError,
  captureException,
  getSharedData,
  Instagram,
  TYPES,
  type InstagramViewer,
  type ScanProgress,
} from '@extension/shared';
import { sendMessageToBackground } from '@src/lib/utils';

let instagram: Instagram | undefined;
let viewer: InstagramViewer | undefined;
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

const ready = (async () => {
  try {
    const sharedData = await getSharedData();
    if (!sharedData) return;

    viewer = sharedData.config.viewer;
    instagram = new Instagram(sharedData);
    pushViewer();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendMessageToBackground({
        type: TYPES.AUTH_ERROR,
        errorMessage: error.message,
      }).catch(console.error);
    } else {
      captureException(error as Error);
    }
  }
})();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  sendResponse({ reply: 'ok' });

  if (request.type === TYPES.GET_VIEWER_DATA) {
    pushViewer();
    return;
  }

  if (request.type === TYPES.GET_SCAN_STATE) {
    pushScanState();
    return;
  }

  void (async () => {
    await ready;
    if (!instagram) return;

    if (request.type === TYPES.GET_PEOPLE) {
      if (scanning) {
        pushScanState();
        return;
      }

      scanning = true;
      try {
        const users = await instagram.getPeople(pushProgress);
        sendMessageToBackground({
          users,
          viewer,
          type: TYPES.SET_PEOPLE,
        }).catch(console.error);
      } catch (error) {
        if (error instanceof AuthenticationError) {
          sendMessageToBackground({
            type: TYPES.AUTH_ERROR,
            errorMessage: error.message,
          }).catch(console.error);
        } else {
          captureException(error as Error);
          sendMessageToBackground({
            type: TYPES.ERROR,
            errorMessage: error instanceof Error ? error.message : undefined,
          }).catch(console.error);
        }
      } finally {
        scanning = false;
        lastProgress = null;
      }
    }

    if (request.type === TYPES.UNFOLLOW) {
      try {
        const { status, deletedId } = await instagram.unFollow(request.user);
        sendMessageToBackground({
          status,
          type: status ? TYPES.UNFOLLOWED : TYPES.ERROR,
          user: request.user,
          deletedId,
        }).catch(console.error);
      } catch (error) {
        if (error instanceof AuthenticationError) {
          sendMessageToBackground({
            type: TYPES.AUTH_ERROR,
            errorMessage: error.message,
            deletedId: request.user?.id,
          }).catch(console.error);
        } else if (error instanceof ActionBlockedError) {
          sendMessageToBackground({
            status: false,
            type: TYPES.ACTION_BLOCKED,
            user: request.user,
            deletedId: request.user?.id,
            errorMessage: error.message,
            cooldownMs: error.cooldownMs,
          }).catch(console.error);
        } else {
          sendMessageToBackground({
            status: false,
            type: TYPES.ERROR,
            user: request.user,
            deletedId: request.user?.id,
            errorMessage: error instanceof Error ? error.message : undefined,
          }).catch(console.error);
        }
      }
    }
  })();
});
