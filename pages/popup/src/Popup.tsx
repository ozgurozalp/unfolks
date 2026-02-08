import { withErrorBoundary, withSuspense } from '@extension/shared';
import { Button, cn, Toaster } from '@extension/ui';
import { Trans, useTranslation } from 'react-i18next';

import { useCallback, useEffect, useState } from 'react';
import Loading from '@src/components/Loading';
import UserList from '@src/components/UserList';
import ProfileCard from '@src/components/ProfileCard';
import { useMainStore } from '@src/store';
import { TYPES } from '@src/constants';
import type { Request } from '@src/types';
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

  const callback = useCallback(
    (request: Request) => {
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
          }

          setUnfollowers(newUsers);
          setLoading(false);
          break;
        }
        case TYPES.UNFOLLOWED: {
          if (request.status && request.deletedId) removeUnfollower(request.deletedId);
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
          if (request.viewer) setViewer(request.viewer);
          break;
        }
      }
    },
    [t, setUnfollowers, setLoading, removeUnfollower, changeUserLoading, previousUnfollowerCount, setViewer],
  );

  useEffect(() => {
    const port = chrome.runtime.connect();
    port.onMessage.addListener(callback);
    return () => {
      port.onMessage.removeListener(callback);
    };
  }, [callback]);

  useEffect(() => {
    if (isInstagram) {
      sendMessage({ type: TYPES.GET_VIEWER_DATA }).catch(console.error);
    }
  }, [isInstagram]);

  const getPeople = async () => {
    if (loading) return;

    if (!isInstagram) {
      chrome.tabs.create({ url: 'https://www.instagram.com/', active: true }).catch(console.error);
      return;
    }

    try {
      setLoading(true);
      await sendMessage({ type: TYPES.GET_PEOPLE });
    } catch (error: any) {
      toast.error(t('notConnected'), {
        id: 'get-people-error',
        position: 'bottom-center',
      });
      setLoading(false);
    }
  };

  let buttonText = t('refresh');
  if (!unfollowers) {
    buttonText = t('showUnfollowers');
  }

  const showButtonIcon = isInstagram;
  const firstTime = unfollowers === null;

  return (
    <>
      <div
        className={cn(
          'app grid h-full py-4',
          !showButtonIcon && 'items-center',
          Array.isArray(unfollowers) ? 'not-fist-time' : 'first-time',
        )}
      >
        {firstTime && (
          <div className="mb-4 space-y-4 text-center">
            <p className="text-2xl">{t('firstTime')}</p>
            {isInstagram ? (
              <p className="text-balance text-lg">
                <Trans i18nKey="infoInInstagram" values={{ buttonText }} components={{ bold: <strong key="bold" /> }} />
              </p>
            ) : (
              <p className="text-balance text-2xl">{t('infoNotInInstagram')}</p>
            )}
          </div>
        )}

        {viewer && !firstTime && (
          <ProfileCard
            action={
              <Button className="h-10 min-h-10" variant="outline" disabled={loading} onClick={getPeople}>
                <RefreshCw className={cn('size-3', !showButtonIcon && 'hidden', loading && 'animate-spin')} />
                {isInstagram ? buttonText : t('goToInstagram')}
              </Button>
            }
            viewer={viewer}
          />
        )}

        {firstTime && (
          <Button className="h-10 min-h-10 w-full" variant="outline" disabled={loading} onClick={getPeople}>
            <RefreshCw className={cn('size-3', !showButtonIcon && 'hidden', loading && 'animate-spin')} />
            {isInstagram ? buttonText : t('goToInstagram')}
          </Button>
        )}

        <UserList users={unfollowers} />
      </div>
      <Toaster richColors />
    </>
  );
}

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
