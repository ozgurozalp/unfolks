import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { User } from '@src/types';

type Tab = 'all' | 'normal' | 'verified';

export interface MainStore {
  unfollowers: User[] | null;
  isInstagram: boolean;
  previousUnfollowerCount: number | null;
  newUnfollowersCount: number | null;
  setUnfollowers: (unfollowers: User[]) => void;
  clearUnfollowers: () => void;
  removeUnfollower: (id: string) => void;
  changeUserLoading: (id: string, loading: boolean) => void;
  selectedTab: Tab;
  setSelectedTab: (tab: Tab) => void;
  clearNewUnfollowersCount: () => void;
}

export const useMainStore = create<MainStore>()(
  devtools(
    persist(
      set => ({
        selectedTab: 'all',
        setSelectedTab: tab => set({ selectedTab: tab }),
        isInstagram: false,
        unfollowers: null,
        previousUnfollowerCount: null,
        newUnfollowersCount: null,
        setUnfollowers: unfollowers =>
          set(state => {
            const currentCount = unfollowers.length;
            const previousCount = state.previousUnfollowerCount;
            let newUnfollowersCount = null;

            // If there's a previous count and the current count is greater, calculate the difference
            if (previousCount !== null && currentCount > previousCount) {
              newUnfollowersCount = currentCount - previousCount;
            }

            return {
              unfollowers,
              previousUnfollowerCount: currentCount,
              newUnfollowersCount,
            };
          }),
        clearUnfollowers: () => set({ unfollowers: [] }),
        removeUnfollower: id =>
          set(state => ({
            unfollowers: state.unfollowers?.filter(user => user.id !== id),
          })),
        changeUserLoading: (id, loading) => {
          set(state => ({
            unfollowers: state.unfollowers?.map(user =>
              user.id === id ? { ...user, unFollowLoading: loading } : user,
            ),
          }));
        },
        clearNewUnfollowersCount: () => set({ newUnfollowersCount: null }),
      }),
      {
        name: 'main-storage',
        partialize: state => ({
          unfollowers: state.unfollowers,
          previousUnfollowerCount: state.previousUnfollowerCount,
        }),
      },
    ),
  ),
);
