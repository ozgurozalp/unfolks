import {
  ActionBlockedError,
  AuthenticationError,
  captureException,
  getSharedData,
  Instagram,
  TYPES,
  type InstagramViewer,
} from '@extension/shared';
import { sendMessageToBackground } from '@src/lib/utils';

let instagram: Instagram | undefined;
let viewer: InstagramViewer | undefined;

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

  void (async () => {
    await ready;
    if (!instagram) return;

    if (request.type === TYPES.GET_PEOPLE) {
      try {
        const users = await instagram.getPeople(progress => {
          sendMessageToBackground({
            type: TYPES.PROGRESS,
            phase: progress.phase,
            current: progress.current,
            total: progress.total,
          }).catch(console.error);
        });
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
