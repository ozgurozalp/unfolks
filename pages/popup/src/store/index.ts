import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import {
  DEFAULT_USER_SORT,
  resolveUserSortKey,
  type InstagramViewer,
  type User,
  type UserSortKey,
} from '@extension/shared';

export type Tab = 'all' | 'normal' | 'verified';

const SORT_STORAGE_KEY = 'unfolks-sort-key';

function readStoredSortKey(): UserSortKey {
  try {
    const dedicated = localStorage.getItem(SORT_STORAGE_KEY);
    if (dedicated) return resolveUserSortKey(dedicated);

    const persisted = localStorage.getItem('main-storage');
    if (!persisted) return DEFAULT_USER_SORT;

    const parsed = JSON.parse(persisted) as { state?: { sortKey?: unknown } };
    const fromPersist = parsed.state?.sortKey;
    if (fromPersist == null) return DEFAULT_USER_SORT;

    const sortKey = resolveUserSortKey(fromPersist);
    writeStoredSortKey(sortKey);
    return sortKey;
  } catch {
    return DEFAULT_USER_SORT;
  }
}

function writeStoredSortKey(sortKey: UserSortKey) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, sortKey);
  } catch {
    // Ignore quota / private-mode failures; zustand persist is the fallback.
  }
}

export interface MainStore {
  unfollowers: User[] | null;
  /** Whether an Instagram tab is open somewhere, active or in the background. */
  hasInstagramTab: boolean;
  previousUnfollowerCount: number | null;
  lastScannedAt: number | null;
  blockedUntil: number | null;
  viewer: InstagramViewer | null;
  setViewer: (viewer: InstagramViewer | null) => void;
  setUnfollowers: (unfollowers: User[]) => void;
  clearUnfollowers: () => void;
  removeUnfollower: (id: string) => void;
  changeUserLoading: (id: string, loading: boolean) => void;
  setBlockedUntil: (blockedUntil: number | null) => void;
  selectedTab: Tab;
  setSelectedTab: (tab: Tab) => void;
  sortKey: UserSortKey;
  setSortKey: (sortKey: UserSortKey) => void;
}

export const useMainStore = create<MainStore>()(
  devtools(
    persist(
      set => ({
        selectedTab: 'all',
        setSelectedTab: tab => set({ selectedTab: tab }),
        sortKey: readStoredSortKey(),
        setSortKey: sortKey => {
          const next = resolveUserSortKey(sortKey);
          writeStoredSortKey(next);
          set({ sortKey: next });
        },
        hasInstagramTab: false,
        unfollowers: null,
        previousUnfollowerCount: null,
        lastScannedAt: null,
        blockedUntil: null,
        viewer: null,
        setViewer: viewer => set({ viewer }),
        setUnfollowers: unfollowers =>
          set({
            unfollowers,
            previousUnfollowerCount: unfollowers.length,
            lastScannedAt: Date.now(),
          }),
        setBlockedUntil: blockedUntil => set({ blockedUntil }),
        clearUnfollowers: () => set({ unfollowers: null, previousUnfollowerCount: null, lastScannedAt: null }),
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
      }),
      {
        name: 'main-storage',
        storage: createJSONStorage(() => localStorage),
        partialize: state => ({
          unfollowers: state.unfollowers,
          previousUnfollowerCount: state.previousUnfollowerCount,
          lastScannedAt: state.lastScannedAt,
          blockedUntil: state.blockedUntil,
          viewer: state.viewer,
          sortKey: resolveUserSortKey(state.sortKey),
        }),
        merge: (persisted, current) => {
          const stored = persisted as Partial<MainStore> | undefined;
          return {
            ...current,
            ...stored,
            sortKey: readStoredSortKey(),
          };
        },
      },
    ),
  ),
);
