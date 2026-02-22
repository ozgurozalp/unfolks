import { AuthenticationError, captureException, getSharedData, Instagram, TYPES } from '@extension/shared';
import { sendMessageToBackground } from '@src/lib/utils';

export const initSharedData = async () => {
  try {
    const sharedData = await getSharedData();
    if (!sharedData) return;

    const instagram = new Instagram(sharedData);

    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
      sendResponse({ reply: 'ok' }); // Required to send response

      if (request.type === TYPES.GET_VIEWER_DATA) {
        sendMessageToBackground({
          type: TYPES.SET_VIEWER_DATA,
          viewer: sharedData.config.viewer,
        }).catch(console.error);
        return;
      }

      if (request.type === TYPES.GET_PEOPLE) {
        try {
          const users = await instagram.getPeople();
          sendMessageToBackground({
            users,
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
          } else {
            sendMessageToBackground({
              status: false,
              type: TYPES.ERROR,
              user: request.user,
              deletedId: request.user?.id,
            }).catch(console.error);
          }
        }
      }
    });
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
};

initSharedData();
