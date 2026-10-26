import {
  buildReportMailto,
  findNewUnfollowers,
  isSameViewer,
  TYPES,
  useMountEffect,
  withErrorBoundary,
  withSuspense,
} from '@extension/shared';
import type { Request } from '@extension/shared';
import { Button, cn, Toaster } from '@extension/ui';
import { useTranslation } from 'react-i18next';

import { useEffect, useRef, useState } from 'react';
import UserList from '@src/components/UserList';
import ProfileCard from '@src/components/ProfileCard';
import Onboarding from '@src/components/Onboarding';
import ScanStatus from '@src/components/ScanStatus';
import SlowScanNotice from '@src/components/SlowScanNotice';
import SettingsDialog from '@src/components/SettingsDialog';
import ExportView from '@src/components/ExportView';
import { useMainStore } from '@src/store';
import { useRateLimitedUnfollow } from '@src/hooks/useRateLimitedUnfollow';
import formatDuration from '@src/helpers/formatDuration';
import { AlertTriangle, FileArchive, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import sendMessage from '@src/helpers/sendMessage';
import { formatDistanceToNow } from 'date-fns';
import { enUS, tr } from 'date-fns/locale';

const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;
/** A first scan running this long gets a Cancel option. */
const SLOW_SCAN_MS = 3 * 60 * 1000;

function Popup() {
  const { t, i18n } = useTranslation();
  const {
    unfollowers,
    hasInstagramTab,
    setUnfollowers,
    removeUnfollower,
    changeUserLoading,
    clearUnfollowers,
    lastScannedAt,
    blockedUntil,
    setBlockedUntil,
    viewer,
    setViewer,
    checkpoint,
    setCheckpoint,
    scanIssue,
    setScanIssue,
    scanSpeed,
    clearSelection,
    setScanning,
    noteUnfollowResult,
  } = useMainStore();
  const [view, setView] = useState<'main' | 'export'>('main');
  const [tabHidden, setTabHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSince, setLoadingSince] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { cancelBulk } = useRateLimitedUnfollow();

  const isBlocked = typeof blockedUntil === 'number' && blockedUntil > now;
  // After Instagram pushed back, no scan may start until the wait is over.
  const scanWaitMs =
    checkpoint && (!viewer || viewer.id === checkpoint.viewerId) && checkpoint.cooldownUntil > now
      ? checkpoint.cooldownUntil - now
      : 0;

  const stopLoading = () => {
    setLoading(false);
    setLoadingSince(null);
    setProgress(null);
    setRetryUntil(null);
    setTabHidden(false);
  };

  // Ticking clock to drive the cooldown countdown and the "last scan" label.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Rows and the bulk bar read this to hold unfollows while a scan runs.
  useEffect(() => setScanning(loading), [loading, setScanning]);

  // Clearing an expired cooldown re-renders the memoized list, whose buttons
  // would otherwise stay disabled after the countdown reaches zero.
  useEffect(() => {
    if (blockedUntil === null) return;
    const id = window.setTimeout(() => setBlockedUntil(null), Math.max(0, blockedUntil - Date.now()));
    return () => window.clearTimeout(id);
  }, [blockedUntil, setBlockedUntil]);

  const handleMessage = (request: Request) => {
    switch (request.type) {
      case TYPES.SET_PEOPLE: {
        const newUsers = request.users ?? [];
        const accountChanged = Boolean(request.viewer && viewer && !isSameViewer(viewer, request.viewer));
        if (accountChanged) cancelBulk();
        // A list from another account says nothing about who unfollowed this one.
        const previous = accountChanged ? null : unfollowers;
        const newUnfollowersCount = findNewUnfollowers(previous, newUsers).length;

        if (newUnfollowersCount > 0) {
          const message =
            newUnfollowersCount === 1
              ? t('newUnfollowersWarning_one', { count: newUnfollowersCount })
              : t('newUnfollowersWarning_other', { count: newUnfollowersCount });
          toast.warning(message, {
            id: 'new-unfollowers-warning',
            position: 'bottom-center',
            duration: 5000,
          });
        } else if (request.deliveredLate) {
          // The list may look unchanged, so say plainly that it is fresh.
          toast.success(t('scanFinishedWhileClosed'), {
            id: 'list-updated',
            position: 'bottom-center',
            duration: 10000,
          });
        } else if (previous !== null) {
          toast.success(t('listUpdated'), {
            id: 'list-updated',
            position: 'bottom-center',
          });
        }

        if (request.incomplete) {
          toast.warning(t('scanIncomplete'), {
            id: 'scan-incomplete',
            position: 'bottom-center',
            duration: 8000,
          });
        }

        setUnfollowers(newUsers);
        clearSelection();
        setCheckpoint(null);
        setScanIssue(null);
        if (request.viewer) setViewer(request.viewer);
        stopLoading();
        break;
      }
      case TYPES.SCAN_STOPPED: {
        stopLoading();
        setCheckpoint(request.checkpoint ?? null);
        // A block on list requests usually covers unfollows too.
        if (request.stopReason === 'blocked' && request.checkpoint?.cooldownUntil) {
          setBlockedUntil(request.checkpoint.cooldownUntil);
        }
        const message = request.errorMessage || t('notConnected');
        setScanIssue({ message, detail: request.errorDetail });
        toast.error(message, { id: 'scan-stopped', position: 'bottom-center', duration: 8000 });
        break;
      }
      case TYPES.SCAN_CANCELLED: {
        stopLoading();
        setCheckpoint(request.checkpoint ?? null);
        setScanIssue(null);
        toast.info(t('scanCancelled'), { id: 'scan-cancelled', position: 'bottom-center' });
        break;
      }
      case TYPES.LOGS_REPORT: {
        if (!request.report) break;
        window.location.href = buildReportMailto(request.report);
        toast.success(t('logsEmailOpened'), { id: 'logs-email', position: 'bottom-center' });
        break;
      }
      case TYPES.CHECKPOINT_INFO: {
        setCheckpoint(request.checkpoint ?? null);
        break;
      }
      case TYPES.PROGRESS: {
        setLoading(true);
        setLoadingSince(since => since ?? Date.now());
        if (typeof request.current === 'number' && typeof request.total === 'number') {
          setProgress({ current: request.current, total: request.total });
        }
        if (typeof request.retryInMs === 'number' && request.retryInMs > 0) {
          setRetryUntil(Date.now() + request.retryInMs);
        } else {
          setRetryUntil(null);
        }
        setTabHidden(Boolean(request.tabHidden));
        break;
      }
      case TYPES.UNFOLLOWED: {
        if (request.status && request.deletedId) {
          noteUnfollowResult(true);
          removeUnfollower(request.deletedId);
        } else if (request.deletedId) {
          changeUserLoading(request.deletedId, false);
        }
        break;
      }
      case TYPES.AUTH_ERROR: {
        if (request.deletedId) {
          changeUserLoading(request.deletedId, false);
          noteUnfollowResult(false, true);
        }
        stopLoading();
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
        if (request.deletedId) {
          changeUserLoading(request.deletedId, false);
          noteUnfollowResult(false);
        }
        // A failed scan (not a failed unfollow) keeps its detail line for bug reports.
        if (!request.deletedId) {
          stopLoading();
          setScanIssue({ message: request.errorMessage || t('notConnected'), detail: request.errorDetail });
        }
        toast.error(request.errorMessage || t('notConnected'), {
          id: 'connection-error',
          position: 'bottom-center',
        });
        break;
      }
      case TYPES.SET_VIEWER_DATA: {
        if (request.viewer) {
          // The old list would be unfollowed from the new account, so it must go.
          if (viewer && unfollowers && !isSameViewer(viewer, request.viewer)) {
            cancelBulk();
            clearUnfollowers();
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

    return () => {
      port.onMessage.removeListener(listener);
      port.disconnect();
    };
  });

  // The side panel stays open across tab switches, so viewer data is requested
  // whenever an Instagram tab becomes available, not only on mount.
  useEffect(() => {
    if (!hasInstagramTab) return;

    const syncInstagram = () => {
      sendMessage({ type: TYPES.GET_VIEWER_DATA }).catch(console.error);
      sendMessage({ type: TYPES.GET_SCAN_STATE }).catch(console.error);
      sendMessage({ type: TYPES.GET_CHECKPOINT }).catch(console.error);
    };
    syncInstagram();
    const retryIds = [400, 1200].map(ms => window.setTimeout(syncInstagram, ms));

    return () => retryIds.forEach(id => window.clearTimeout(id));
  }, [hasInstagramTab]);

  const getPeople = async (resume = false) => {
    if (loading || scanWaitMs > 0) return;

    if (!hasInstagramTab) {
      chrome.tabs.create({ url: 'https://www.instagram.com/', active: true }).catch(console.error);
      return;
    }

    try {
      setLoading(true);
      setLoadingSince(Date.now());
      setProgress(null);
      setRetryUntil(null);
      setScanIssue(null);
      await sendMessage({ type: TYPES.GET_PEOPLE, resume, scanSpeed });
    } catch {
      toast.error(t('notConnected'), {
        id: 'get-people-error',
        position: 'bottom-center',
      });
      stopLoading();
    }
  };

  const cancelScan = () => {
    sendMessage({ type: TYPES.CANCEL_SCAN }).catch(() => {
      // The tab is gone, so nothing is scanning any more.
      stopLoading();
    });
  };

  const discardCheckpoint = () => {
    setCheckpoint(null);
    setScanIssue(null);
  };

  const progressPercent =
    progress && progress.total > 0 ? Math.min(99, Math.round((progress.current / progress.total) * 100)) : null;
  const retrySeconds = retryUntil && retryUntil > now ? Math.ceil((retryUntil - now) / 1000) : null;

  const idleButtonText = scanWaitMs
    ? t('scanCooldownButton', { time: formatDuration(scanWaitMs) })
    : unfollowers
      ? t('refresh')
      : t('showUnfollowers');
  const buttonText = loading
    ? retrySeconds
      ? t('scanningWaiting', { seconds: retrySeconds })
      : progressPercent !== null
        ? t('scanningPercent', { percent: progressPercent })
        : progress && progress.current > 0
          ? t('scanningCount', { count: progress.current })
          : t('scanning')
    : idleButtonText;
  const firstTime = unfollowers === null;
  const scanIsSlow = firstTime && loading && loadingSince !== null && now - loadingSince >= SLOW_SCAN_MS;

  const lastScanNote = lastScannedAt ? (
    <p className="truncate text-xs leading-none text-muted-foreground">
      {t('lastScanned', {
        time: formatDistanceToNow(lastScannedAt, {
          addSuffix: true,
          locale: i18n.language === 'tr' ? tr : enUS,
        }),
      })}
    </p>
  ) : null;

  const visibleButtonText = hasInstagramTab ? buttonText : t('goToInstagram');
  const buttonWidthLocks = hasInstagramTab
    ? [
        idleButtonText,
        t('scanning'),
        t('scanningCount', { count: 88888 }),
        t('scanningPercent', { percent: 88 }),
        t('scanningWaiting', { seconds: 60 }),
        t('scanCooldownButton', { time: '0:00:00' }),
      ]
    : [visibleButtonText];

  const renderRefreshButton = (className?: string) => (
    <Button
      className={cn('h-10 max-h-10 min-h-10 shrink-0 justify-center leading-none tabular-nums', className)}
      variant="outline"
      disabled={loading || scanWaitMs > 0}
      onClick={() => getPeople(false)}
    >
      <span className="inline-grid justify-items-center">
        {buttonWidthLocks.map((label, index) => (
          <span
            key={index}
            className="invisible col-start-1 row-start-1 inline-flex items-center gap-1.5 whitespace-nowrap"
            aria-hidden
          >
            {hasInstagramTab && <RefreshCw className="size-4 shrink-0" />}
            {label}
          </span>
        ))}
        <span className="col-start-1 row-start-1 inline-flex items-center gap-1.5 whitespace-nowrap">
          {hasInstagramTab && <RefreshCw className={cn('size-4 shrink-0', loading && 'animate-spin')} aria-hidden />}
          {visibleButtonText}
        </span>
      </span>
    </Button>
  );

  if (view === 'export') {
    return (
      <>
        <div className="app h-full py-4">
          <ExportView onBack={() => setView('main')} />
        </div>
        <Toaster richColors />
      </>
    );
  }

  const exportLink = (
    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setView('export')}>
      <FileArchive className="size-4" />
      {t('exportOpen')}
    </Button>
  );

  return (
    <>
      <div
        className={cn(
          'app grid h-full py-4',
          !hasInstagramTab && 'items-center',
          firstTime ? 'first-time' : 'not-first-time',
        )}
      >
        {firstTime ? (
          <Onboarding
            hasInstagramTab={hasInstagramTab}
            idleButtonText={idleButtonText}
            loading={loading}
            action={
              <div className="grid gap-2">
                {renderRefreshButton('w-full')}
                {!loading && (
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {exportLink}
                    <SettingsDialog showLabel className="text-muted-foreground" />
                  </div>
                )}
                {!loading && <p className="text-xs text-muted-foreground">{t('exportOpenHint')}</p>}
              </div>
            }
          />
        ) : (
          <>
            <ProfileCard
              action={
                <div className="flex items-center gap-2">
                  <SettingsDialog />
                  {renderRefreshButton('min-w-0 flex-1 roomy:flex-none')}
                </div>
              }
              viewer={viewer}
            />
          </>
        )}

        <ScanStatus loading={loading} onResume={() => getPeople(true)} onDiscard={discardCheckpoint} />

        {loading && (
          <div className="mt-2">
            <div className="grid h-5 w-full place-items-center">
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
            </div>
            {(!firstTime || retrySeconds) && (
              <p className="mt-2 text-balance text-center text-xs text-muted-foreground">
                {retrySeconds ? t('scanRateLimit', { seconds: retrySeconds }) : t('scanningInfo')}
              </p>
            )}
            {tabHidden && (
              <p className="mt-1 text-balance text-center text-xs font-medium text-amber-600">{t('tabHiddenHint')}</p>
            )}
          </div>
        )}

        {scanIsSlow && <SlowScanNotice onCancel={cancelScan} detail={scanIssue?.detail} />}

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

        <UserList
          users={unfollowers}
          lastScanNote={lastScanNote}
          secondaryAction={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
              title={t('exportOpenHint')}
              onClick={() => setView('export')}
            >
              <FileArchive className="size-3.5" />
              <span className="roomy:hidden">{t('exportOpenShort')}</span>
              <span className="hidden roomy:inline">{t('exportOpen')}</span>
            </Button>
          }
        />
      </div>
      <Toaster richColors />
    </>
  );
}

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
