import { TYPES, useMountEffect, withErrorBoundary, withSuspense } from '@extension/shared';
import type { Request } from '@extension/shared';
import { Button, cn, Toaster } from '@extension/ui';
import { Trans, useTranslation } from 'react-i18next';

import { useRef, useState } from 'react';
import UserList from '@src/components/UserList';
import ProfileCard from '@src/components/ProfileCard';
import AnnouncementDialog from '@src/components/AnnouncementDialog';
import { useMainStore } from '@src/store';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import sendMessage from '@src/helpers/sendMessage';

function Popup() {
  const { t } = useTranslation();
  const {
    unfollowers,
    isInstagram,
    setUnfollowers,
    removeUnfollower,
    changeUserLoading,
    previousUnfollowerCount,
    viewer,
    setViewer,
  } = useMainStore();
  const [loading, setLoading] = useState(false);

  const handleMessage = (request: Request) => {
    switch (request.type) {
      case TYPES.SET_PEOPLE: {
        const newUsers = request.users ?? [];
        const currentCount = newUsers.length;

        // Check if we should show warning
        if (previousUnfollowerCount !== null && currentCount > previousUnfollowerCount) {
          const newUnfollowersCount = currentCount - previousUnfollowerCount;
          const message =
            newUnfollowersCount === 1
              ? t('newUnfollowersWarning_one', { count: newUnfollowersCount })
              : t('newUnfollowersWarning_other', { count: newUnfollowersCount });
          toast.warning(message, {
            id: 'new-unfollowers-warning',
            position: 'bottom-center',
            duration: 5000,
          });
        } else if (previousUnfollowerCount !== null) {
          toast.success(t('listUpdated'), {
            id: 'list-updated',
            position: 'bottom-center',
          });
        }

        setUnfollowers(newUsers);
        setLoading(false);
        break;
      }
      case TYPES.UNFOLLOWED: {
        if (request.status && request.deletedId) {
          removeUnfollower(request.deletedId);
        } else if (request.deletedId) {
          changeUserLoading(request.deletedId, false);
        }
        break;
      }
      case TYPES.AUTH_ERROR: {
        if (request.deletedId) changeUserLoading(request.deletedId, false);
        setLoading(false);
        toast.error(request.errorMessage || t('authError'), {
          id: 'auth-error',
          position: 'bottom-center',
        });
        break;
      }
      case TYPES.ERROR: {
        if (request.deletedId) changeUserLoading(request.deletedId, false);
        toast.error(t('notConnected'), {
          id: 'connection-error',
          position: 'bottom-center',
        });
        break;
      }
      case TYPES.SET_VIEWER_DATA: {
        if (request.viewer) {
          if (viewer && unfollowers && viewer.username !== request.viewer.username) {
            useMainStore.setState({ previousUnfollowerCount: null });
            toast.warning(t('accountChanged'), {
              id: 'account-changed',
              position: 'bottom-center',
              duration: 5000,
            });
          }
          setViewer(request.viewer);
        }
        break;
      }
    }
  };

  // Keep a stable listener that always sees the latest handler/state.
  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  useMountEffect(() => {
    const port = chrome.runtime.connect();
    const listener = (request: Request) => handleMessageRef.current(request);
    port.onMessage.addListener(listener);

    if (useMainStore.getState().isInstagram) {
      sendMessage({ type: TYPES.GET_VIEWER_DATA }).catch(console.error);
    }

    return () => {
      port.onMessage.removeListener(listener);
      port.disconnect();
    };
  });

  const getPeople = async () => {
    if (loading) return;

    if (!isInstagram) {
      chrome.tabs.create({ url: 'https://www.instagram.com/', active: true }).catch(console.error);
      return;
    }

    try {
      setLoading(true);
      await sendMessage({ type: TYPES.GET_PEOPLE });
    } catch {
      toast.error(t('notConnected'), {
        id: 'get-people-error',
        position: 'bottom-center',
      });
      setLoading(false);
    }
  };

  const buttonText = unfollowers ? t('refresh') : t('showUnfollowers');
  const firstTime = unfollowers === null;

  const renderRefreshButton = (className?: string) => (
    <Button className={cn('h-10 min-h-10', className)} variant="outline" disabled={loading} onClick={getPeople}>
      <RefreshCw className={cn('size-3', !isInstagram && 'hidden', loading && 'animate-spin')} />
      {isInstagram ? buttonText : t('goToInstagram')}
    </Button>
  );

  return (
    <>
      <div
        className={cn(
          'app grid h-full py-4',
          !isInstagram && 'items-center',
          firstTime ? 'first-time' : 'not-fist-time',
        )}
      >
        {firstTime ? (
          <>
            <div className="mb-4 space-y-4 text-center">
              <p className="text-2xl">{t('firstTime')}</p>
              {isInstagram ? (
                <p className="text-balance text-lg">
                  <Trans
                    i18nKey="infoInInstagram"
                    values={{ buttonText }}
                    components={{ bold: <strong key="bold" /> }}
                  />
                </p>
              ) : (
                <p className="text-balance text-2xl">{t('infoNotInInstagram')}</p>
              )}
            </div>
            {renderRefreshButton('w-full')}
          </>
        ) : (
          <ProfileCard action={renderRefreshButton()} viewer={viewer} />
        )}

        <UserList users={unfollowers} />
      </div>
      {unfollowers && unfollowers.length > 0 && <AnnouncementDialog />}
      <Toaster richColors />
    </>
  );
}

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
