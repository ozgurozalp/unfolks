import { TYPES, useMountEffect, withErrorBoundary, withSuspense } from '@extension/shared';
import type { Request } from '@extension/shared';
import { Button, cn, Toaster } from '@extension/ui';
import { useTranslation } from 'react-i18next';

import { useEffect, useRef, useState } from 'react';
import UserList from '@src/components/UserList';
import ProfileCard from '@src/components/ProfileCard';
import Onboarding from '@src/components/Onboarding';
import AnnouncementDialog from '@src/components/AnnouncementDialog';
import { useMainStore } from '@src/store';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import sendMessage from '@src/helpers/sendMessage';
import { formatDistanceToNow } from 'date-fns';
import { enUS, tr } from 'date-fns/locale';

const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function Popup() {
  const { t, i18n } = useTranslation();
  const {
    unfollowers,
    isInstagram,
    setUnfollowers,
    removeUnfollower,
    changeUserLoading,
    previousUnfollowerCount,
    lastScannedAt,
    blockedUntil,
    setBlockedUntil,
    viewer,
    setViewer,
  } = useMainStore();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isBlocked = typeof blockedUntil === 'number' && blockedUntil > now;

  // Ticking clock to drive the cooldown countdown and the "last scan" label.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
        setProgress(null);
        break;
      }
      case TYPES.PROGRESS: {
        if (typeof request.current === 'number' && typeof request.total === 'number') {
          setProgress({ current: request.current, total: request.total });
        }
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
        setProgress(null);
        toast.error(request.errorMessage || t('authError'), {
          id: 'auth-error',
          position: 'bottom-center',
        });
        break;
      }
      case TYPES.ACTION_BLOCKED: {
        if (request.deletedId) changeUserLoading(request.deletedId, false);
        const cooldownMs = typeof request.cooldownMs === 'number' ? request.cooldownMs : DEFAULT_COOLDOWN_MS;
        setBlockedUntil(Date.now() + cooldownMs);
        toast.error(request.errorMessage || t('actionBlocked'), {
          id: 'action-blocked',
          position: 'bottom-center',
          duration: 6000,
        });
        break;
      }
      case TYPES.ERROR: {
        if (request.deletedId) changeUserLoading(request.deletedId, false);
        setLoading(false);
        setProgress(null);
        toast.error(request.errorMessage || t('notConnected'), {
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
      setProgress(null);
      await sendMessage({ type: TYPES.GET_PEOPLE });
    } catch {
      toast.error(t('notConnected'), {
        id: 'get-people-error',
        position: 'bottom-center',
      });
      setLoading(false);
      setProgress(null);
    }
  };

  const progressPercent =
    progress && progress.total > 0 ? Math.min(99, Math.round((progress.current / progress.total) * 100)) : null;

  const idleButtonText = unfollowers ? t('refresh') : t('showUnfollowers');
  const buttonText = loading
    ? progressPercent !== null
      ? t('scanningPercent', { percent: progressPercent })
      : progress && progress.current > 0
        ? t('scanningCount', { count: progress.current })
        : t('scanning')
    : idleButtonText;
  const firstTime = unfollowers === null;

  const visibleButtonText = isInstagram ? buttonText : t('goToInstagram');
  const buttonWidthLocks = isInstagram
    ? [idleButtonText, t('scanning'), t('scanningCount', { count: 88888 }), t('scanningPercent', { percent: 88 })]
    : [visibleButtonText];

  const renderRefreshButton = (className?: string) => (
    <Button
      className={cn('h-10 max-h-10 min-h-10 shrink-0 justify-center leading-none tabular-nums', className)}
      variant="outline"
      disabled={loading}
      onClick={getPeople}
    >
      {isInstagram && (
        <span className="relative size-4 shrink-0 overflow-hidden">
          <RefreshCw className={cn('absolute inset-0 size-4', loading && 'animate-spin')} aria-hidden />
        </span>
      )}
      <span className="inline-grid justify-items-center">
        {buttonWidthLocks.map((label, index) => (
          <span key={index} className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
            {label}
          </span>
        ))}
        <span className="col-start-1 row-start-1 whitespace-nowrap">{visibleButtonText}</span>
      </span>
    </Button>
  );

  return (
    <>
      <div
        className={cn(
          'app grid h-full py-4',
          !isInstagram && 'items-center',
          firstTime ? 'first-time' : 'not-first-time',
        )}
      >
        {firstTime ? (
          <Onboarding
            isInstagram={isInstagram}
            idleButtonText={idleButtonText}
            loading={loading}
            action={renderRefreshButton('w-full')}
          />
        ) : (
          <ProfileCard action={renderRefreshButton()} viewer={viewer} />
        )}

        {(!firstTime || loading) && (
          <div className="mt-2 grid h-5 w-full place-items-center">
            {loading ? (
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                {progressPercent !== null ? (
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                ) : (
                  <motion.div
                    className="absolute inset-y-0 w-2/5 rounded-full bg-primary"
                    initial={{ x: '-100%' }}
                    animate={{ x: '250%' }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                  />
                )}
              </div>
            ) : (
              lastScannedAt && (
                <p className="text-center text-xs leading-none text-muted-foreground">
                  {t('lastScanned', {
                    time: formatDistanceToNow(lastScannedAt, {
                      addSuffix: true,
                      locale: i18n.language === 'tr' ? tr : enUS,
                    }),
                  })}
                </p>
              )
            )}
          </div>
        )}

        {isBlocked && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">{t('blockedTitle')}</p>
              <p className="text-muted-foreground">
                {t('blockedCountdown', { time: formatDuration((blockedUntil as number) - now) })}
              </p>
            </div>
          </div>
        )}

        <UserList users={unfollowers} />
      </div>
      {unfollowers && unfollowers.length > 0 && <AnnouncementDialog />}
      <Toaster richColors />
    </>
  );
}

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
