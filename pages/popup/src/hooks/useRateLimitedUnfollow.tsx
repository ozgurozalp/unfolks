import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { FATAL_UNFOLLOW_STREAK, useMainStore } from '@src/store';
import { shouldRestAfter, TYPES } from '@extension/shared';
import type { User } from '@extension/shared';
import sendMessage from '@src/helpers/sendMessage';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { type RateLimiter, useRateLimiter } from '@tanstack/react-pacer';

// Single clicks: at most 3 unfollows in any 3 seconds. Batches pace themselves
// with the user's settings and a long rest every few accounts.
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 3000;
const SLEEP_STEP_MS = 250;
/** Failures in a row before a batch gives up instead of hammering Instagram. */
const MAX_FAILURE_STREAK = 3;

export type BulkState = {
  total: number;
  done: number;
  /** Set while the batch rests between groups of unfollows. */
  restingUntil?: number;
} | null;

type UnfollowFn = (user: User) => void;
type RateLimiterContextType = {
  unfollow: UnfollowFn;
  getRemainingInWindow: () => number;
  startBulk: (users: User[]) => void;
  cancelBulk: () => void;
  bulkState: BulkState;
} | null;

const RateLimiterContext = createContext<RateLimiterContextType>(null);

interface RateLimiterProviderProps {
  children: ReactNode;
}

/** Integer in [min, max]. */
const randomBetween = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

const isBlockedNow = () => {
  const { blockedUntil } = useMainStore.getState();
  return typeof blockedUntil === 'number' && blockedUntil > Date.now();
};

/** The batch must stop: a block, a scan in progress, or too many failures in a row. */
const shouldStopBatch = () => {
  const { scanning, unfollowFailureStreak } = useMainStore.getState();
  return isBlockedNow() || scanning || unfollowFailureStreak >= MAX_FAILURE_STREAK;
};

export function RateLimiterProvider({ children }: RateLimiterProviderProps) {
  const changeUserLoading = useMainStore(state => state.changeUserLoading);
  const { t } = useTranslation();
  const [bulkState, setBulkState] = useState<BulkState>(null);
  const bulkRunningRef = useRef(false);
  const cancelRef = useRef(false);

  /** Sleep in small steps so Cancel and a block stop the batch right away. Returns false when stopped. */
  const sleep = useCallback(async (ms: number) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (cancelRef.current || shouldStopBatch()) return false;
      await new Promise(resolve => setTimeout(resolve, Math.min(SLEEP_STEP_MS, until - Date.now())));
    }
    return !cancelRef.current && !shouldStopBatch();
  }, []);

  const rateLimiter = useRateLimiter(
    async (user: User) => {
      try {
        const { viewer } = useMainStore.getState();
        await sendMessage({
          type: TYPES.UNFOLLOW,
          user,
          // Lets the tab refuse if a different account is logged in there now.
          expectedViewer: viewer ? { id: viewer.id, username: viewer.username } : undefined,
        });
      } catch (error) {
        changeUserLoading(user.id, false);
        toast.error(t('notConnected'), { id: 'connection-error', position: 'bottom-center' });
        console.error('Unfollow request failed', error);
      }
    },
    {
      limit: RATE_LIMIT,
      window: RATE_WINDOW_MS,
      windowType: 'sliding',
      onReject: (limiter: RateLimiter<(user: User) => Promise<void>>) => {
        // Bulk mode paces itself and retries rejected calls, so avoid toast spam.
        if (bulkRunningRef.current) return;

        const remainingSeconds = Math.ceil(limiter.getMsUntilNextWindow() / 1000);
        if (remainingSeconds > 0) {
          toast.warning(t('rateLimitWarning', { seconds: remainingSeconds }), {
            id: 'rate-limit-warning',
            position: 'bottom-center',
            duration: 2000,
          });
        }
      },
    },
  );

  const unfollow = useCallback(
    (user: User) => {
      if (isBlockedNow()) return;
      changeUserLoading(user.id, true);
      if (!rateLimiter.maybeExecute(user)) changeUserLoading(user.id, false);
    },
    [changeUserLoading, rateLimiter],
  );

  const cancelBulk = useCallback(() => {
    cancelRef.current = true;
  }, []);

  /** Wait until the single-click limiter lets this account through. False when stopped. */
  const executeWhenAllowed = useCallback(
    async (user: User) => {
      while (!rateLimiter.maybeExecute(user)) {
        if (!(await sleep(Math.max(SLEEP_STEP_MS, rateLimiter.getMsUntilNextWindow())))) return false;
      }
      return true;
    },
    [rateLimiter, sleep],
  );

  const startBulk = useCallback(
    async (users: User[]) => {
      if (bulkRunningRef.current || users.length === 0 || isBlockedNow()) return;

      bulkRunningRef.current = true;
      cancelRef.current = false;
      useMainStore.setState({ unfollowFailureStreak: 0 });
      const pacing = useMainStore.getState().unfollowPacing;
      setBulkState({ total: users.length, done: 0 });

      try {
        for (let i = 0; i < users.length; i += 1) {
          if (cancelRef.current || shouldStopBatch()) break;

          const user = users[i];
          // Skip accounts hidden or already gone since the batch started.
          const { hiddenIds, unfollowers } = useMainStore.getState();
          if (hiddenIds[user.id] || !unfollowers?.some(current => current.id === user.id)) continue;

          changeUserLoading(user.id, true);
          if (!(await executeWhenAllowed(user))) {
            changeUserLoading(user.id, false);
            break;
          }

          const done = i + 1;
          setBulkState({ total: users.length, done });
          if (done >= users.length) break;

          if (shouldRestAfter(done, pacing)) {
            setBulkState({ total: users.length, done, restingUntil: Date.now() + pacing.pauseMs });
            if (!(await sleep(pacing.pauseMs))) break;
            setBulkState({ total: users.length, done });
          }
          if (!(await sleep(randomBetween(pacing.gapMinMs, pacing.gapMaxMs)))) break;
        }
      } finally {
        const streak = useMainStore.getState().unfollowFailureStreak;
        // A sign-out has its own toast; plain failures get one explaining the stop.
        if (streak >= MAX_FAILURE_STREAK && streak < FATAL_UNFOLLOW_STREAK) {
          toast.error(t('bulkStoppedFailures'), { id: 'bulk-stopped', position: 'bottom-center', duration: 8000 });
        }
        bulkRunningRef.current = false;
        setBulkState(null);
      }
    },
    [changeUserLoading, executeWhenAllowed, sleep, t],
  );

  const value = useMemo(
    () => ({ unfollow, getRemainingInWindow: rateLimiter.getRemainingInWindow, startBulk, cancelBulk, bulkState }),
    [unfollow, rateLimiter, startBulk, cancelBulk, bulkState],
  );

  return <RateLimiterContext.Provider value={value}>{children}</RateLimiterContext.Provider>;
}

export function useRateLimitedUnfollow() {
  const context = useContext(RateLimiterContext);

  if (!context) {
    throw new Error('useRateLimitedUnfollow must be used within a RateLimiterProvider');
  }

  return context;
}
