import { createContext, type ReactNode, useCallback, useContext } from 'react';
import { useMainStore } from '@src/store';
import { TYPES } from '@src/constants';
import sendMessage from '@src/helpers/sendMessage';
import type { User } from '@src/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { type RateLimiter, useRateLimiter } from '@tanstack/react-pacer';

// Safe values for Instagram rate limit:
// Allow 1 unfollow per 3 seconds (20 per minute)
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 3000;

type UnfollowFn = (user: User) => void;
type RateLimiterContextType = {
  unfollow: UnfollowFn;
  getRemainingInWindow: () => number;
} | null;

const RateLimiterContext = createContext<RateLimiterContextType>(null);

interface RateLimiterProviderProps {
  children: ReactNode;
}

export function RateLimiterProvider({ children }: RateLimiterProviderProps) {
  const { changeUserLoading } = useMainStore();
  const { t } = useTranslation();

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
      changeUserLoading(user.id, true);

      const executed = rateLimiter.maybeExecute(user);

      // If rejected, reset loading state
      if (!executed) {
        changeUserLoading(user.id, false);
      }
    },
    [changeUserLoading, rateLimiter],
  );

  return (
    <RateLimiterContext.Provider
      value={{
        unfollow,
        getRemainingInWindow: rateLimiter.getRemainingInWindow,
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
