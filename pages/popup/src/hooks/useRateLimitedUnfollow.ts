import { useCallback } from 'react';
import { useMainStore } from '@src/store';
import { TYPES } from '@src/constants';
import sendMessage from '@src/helpers/sendMessage';
import type { User } from '@src/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// Safe values for Instagram rate limit:
// Minimum 3 seconds between unfollow actions
const UNFOLLOW_COOLDOWN_MS = 3000;

// Module-level shared state - common across all hook instances
let lastUnfollowTime = 0;
let pendingUnfollowQueue: Array<{ user: User; resolve: () => void }> = [];
let isProcessingQueue = false;

export function useRateLimitedUnfollow() {
  const { changeUserLoading } = useMainStore();
  const { t } = useTranslation();

  const processQueue = useCallback(async () => {
    if (isProcessingQueue || pendingUnfollowQueue.length === 0) return;
    isProcessingQueue = true;

    while (pendingUnfollowQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastUnfollow = now - lastUnfollowTime;
      const waitTime = Math.max(0, UNFOLLOW_COOLDOWN_MS - timeSinceLastUnfollow);

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const item = pendingUnfollowQueue.shift();
      if (!item) continue;

      try {
        lastUnfollowTime = Date.now();
        await sendMessage({
          type: TYPES.UNFOLLOW,
          user: item.user,
        });
      } catch (error) {
        changeUserLoading(item.user.id, false);
      }
      item.resolve();
    }

    isProcessingQueue = false;
  }, [changeUserLoading]);

  const unfollow = useCallback(
    async (user: User) => {
      const now = Date.now();
      const timeSinceLastUnfollow = now - lastUnfollowTime;

      // Prevent rapid clicking - notify the user
      if (timeSinceLastUnfollow < UNFOLLOW_COOLDOWN_MS && !isProcessingQueue) {
        const remainingSeconds = Math.ceil((UNFOLLOW_COOLDOWN_MS - timeSinceLastUnfollow) / 1000);
        toast.warning(t('rateLimitWarning', { seconds: remainingSeconds }), {
          id: 'rate-limit-warning',
          position: 'bottom-center',
          duration: 2000,
        });
      }

      changeUserLoading(user.id, true);

      // Add to queue
      return new Promise<void>(resolve => {
        pendingUnfollowQueue.push({ user, resolve });
        processQueue();
      });
    },
    [changeUserLoading, processQueue, t],
  );

  return { unfollow };
}
