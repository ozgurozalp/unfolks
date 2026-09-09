import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { useMainStore } from '@src/store';
import { TYPES } from '@extension/shared';
import type { User } from '@extension/shared';
import sendMessage from '@src/helpers/sendMessage';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { type RateLimiter, useRateLimiter } from '@tanstack/react-pacer';

// Safe values for Instagram rate limit:
// Allow 1 unfollow per 3 seconds (20 per minute)
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 3000;
// Extra spacing between bulk unfollows to avoid bursty traffic.
const BULK_MIN_GAP_MS = 2500;
const BULK_MAX_GAP_MS = 4000;

export type BulkState = { total: number; done: number } | null;

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const randomBetween = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));
const isBlockedNow = () => {
  const { blockedUntil } = useMainStore.getState();
  return typeof blockedUntil === 'number' && blockedUntil > Date.now();
};

export function RateLimiterProvider({ children }: RateLimiterProviderProps) {
  const { changeUserLoading } = useMainStore();
  const { t } = useTranslation();
  const [bulkState, setBulkState] = useState<BulkState>(null);
  const bulkRunningRef = useRef(false);
  const cancelRef = useRef(false);

  const rateLimiter = useRateLimiter(
    async (user: User) => {
      try {
        await sendMessage({
          type: TYPES.UNFOLLOW,
          user,
        });
      } catch (error) {
        changeUserLoading(user.id, false);
      }
    },
    {
      limit: RATE_LIMIT,
      window: RATE_WINDOW_MS,
      windowType: 'sliding',
      onReject: (limiter: RateLimiter<(user: User) => Promise<void>>) => {
        // Bulk mode paces itself and retries rejected calls, so avoid toast spam.
        if (bulkRunningRef.current) return;

        const msUntilNext = limiter.getMsUntilNextWindow();
        const remainingSeconds = Math.ceil(msUntilNext / 1000);

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

      const executed = rateLimiter.maybeExecute(user);

      // If rejected, reset loading state
      if (!executed) {
        changeUserLoading(user.id, false);
      }
    },
    [changeUserLoading, rateLimiter],
  );

  const cancelBulk = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const startBulk = useCallback(
    async (users: User[]) => {
      if (bulkRunningRef.current || users.length === 0 || isBlockedNow()) return;

      bulkRunningRef.current = true;
      cancelRef.current = false;
      setBulkState({ total: users.length, done: 0 });

      try {
        for (let i = 0; i < users.length; i += 1) {
          if (cancelRef.current || isBlockedNow()) break;

          const user = users[i];
          changeUserLoading(user.id, true);

          // Wait for the rate limiter to allow this execution.
          let executed = rateLimiter.maybeExecute(user);
          while (!executed) {
            if (cancelRef.current || isBlockedNow()) {
              changeUserLoading(user.id, false);
              break;
            }
            const wait = Math.max(250, rateLimiter.getMsUntilNextWindow());
            await delay(wait);
            executed = rateLimiter.maybeExecute(user);
          }

          if (!executed) break;

          setBulkState({ total: users.length, done: i + 1 });

          // Smooth out bursts even when the limiter would allow more.
          if (i < users.length - 1) {
            await delay(randomBetween(BULK_MIN_GAP_MS, BULK_MAX_GAP_MS));
          }
        }
      } finally {
        bulkRunningRef.current = false;
        setBulkState(null);
      }
    },
    [changeUserLoading, rateLimiter],
  );

  return (
    <RateLimiterContext.Provider
      value={{
        unfollow,
        getRemainingInWindow: rateLimiter.getRemainingInWindow,
        startBulk,
        cancelBulk,
        bulkState,
      }}
    >
      {children}
    </RateLimiterContext.Provider>
  );
}

export function useRateLimitedUnfollow() {
  const context = useContext(RateLimiterContext);

  if (!context) {
    throw new Error('useRateLimitedUnfollow must be used within a RateLimiterProvider');
  }

  return context;
}
