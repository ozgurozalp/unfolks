import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import {
  DEFAULT_SCAN_SPEED,
  DEFAULT_UNFOLLOW_PACING,
  DEFAULT_USER_SORT,
  normalizeUnfollowPacing,
  resolveScanSpeed,
  resolveUserSortKey,
  withoutTransientState,
  type CheckpointSummary,
  type InstagramViewer,
  type ScanSpeed,
  type UnfollowPacing,
  type User,
  type UserSortKey,
} from '@extension/shared';

export type Tab = 'all' | 'normal' | 'verified';

export interface ListFilters {
  onlyPrivate: boolean;
  onlyNoAvatar: boolean;
  /** Show the hidden accounts instead of the visible ones. */
  showHidden: boolean;
}

const DEFAULT_FILTERS: ListFilters = { onlyPrivate: false, onlyNoAvatar: false, showHidden: false };

/** The last scan failure, with the one-line detail for bug reports. */
export interface ScanIssue {
  message: string;
  detail?: string;
}

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
  /** Accounts the user keeps; they never show in the list or in bulk unfollows. */
  hiddenIds: Record<string, true>;
  setHidden: (ids: readonly string[], hidden: boolean) => void;
  /** Accounts ticked for a bulk action. Not saved between sessions. */
  selectedIds: Record<string, true>;
  setSelected: (ids: readonly string[], selected: boolean) => void;
  clearSelection: () => void;
  filters: ListFilters;
  setFilters: (filters: Partial<ListFilters>) => void;
  scanSpeed: ScanSpeed;
  unfollowPacing: UnfollowPacing;
  setPacing: (scanSpeed: ScanSpeed, unfollowPacing: UnfollowPacing) => void;
  /** Saved progress of a scan that stopped partway, as the Instagram tab reports it. */
  checkpoint: CheckpointSummary | null;
  setCheckpoint: (checkpoint: CheckpointSummary | null) => void;
  scanIssue: ScanIssue | null;
  setScanIssue: (issue: ScanIssue | null) => void;
  /** A scan is running; unfollows wait so the scan's result does not bring them back. */
  scanning: boolean;
  setScanning: (scanning: boolean) => void;
  /** Unfollow failures in a row. A batch stops once this gets too high. */
  unfollowFailureStreak: number;
  noteUnfollowResult: (ok: boolean, fatal?: boolean) => void;
}

/** A sign-out counts as enough failures to stop any batch at once. */
export const FATAL_UNFOLLOW_STREAK = 99;

function toggleIds(current: Record<string, true>, ids: readonly string[], on: boolean): Record<string, true> {
  const next = { ...current };
  for (const id of ids) {
    if (on) next[id] = true;
    else delete next[id];
  }
  return next;
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
        lastScannedAt: null,
        blockedUntil: null,
        viewer: null,
        setViewer: viewer => set({ viewer }),
        setUnfollowers: unfollowers =>
          set({
            unfollowers,
            lastScannedAt: Date.now(),
          }),
        setBlockedUntil: blockedUntil => set({ blockedUntil }),
        clearUnfollowers: () => set({ unfollowers: null, lastScannedAt: null, selectedIds: {}, checkpoint: null }),
        removeUnfollower: id =>
          set(state => ({
            unfollowers: state.unfollowers?.filter(user => user.id !== id),
            selectedIds: toggleIds(state.selectedIds, [id], false),
          })),
        hiddenIds: {},
        setHidden: (ids, hidden) =>
          set(state => ({
            hiddenIds: toggleIds(state.hiddenIds, ids, hidden),
            // A hidden account must not stay selected for a bulk unfollow.
            selectedIds: hidden ? toggleIds(state.selectedIds, ids, false) : state.selectedIds,
          })),
        selectedIds: {},
        setSelected: (ids, selected) => set(state => ({ selectedIds: toggleIds(state.selectedIds, ids, selected) })),
        clearSelection: () => set({ selectedIds: {} }),
        filters: DEFAULT_FILTERS,
        setFilters: filters => set(state => ({ filters: { ...state.filters, ...filters }, selectedIds: {} })),
        scanSpeed: DEFAULT_SCAN_SPEED,
        unfollowPacing: DEFAULT_UNFOLLOW_PACING,
        setPacing: (scanSpeed, unfollowPacing) =>
          set({ scanSpeed: resolveScanSpeed(scanSpeed), unfollowPacing: normalizeUnfollowPacing(unfollowPacing) }),
        checkpoint: null,
        setCheckpoint: checkpoint => set({ checkpoint }),
        scanIssue: null,
        setScanIssue: scanIssue => set({ scanIssue }),
        scanning: false,
        setScanning: scanning => set({ scanning }),
        unfollowFailureStreak: 0,
        noteUnfollowResult: (ok, fatal = false) =>
          set(state => ({
            unfollowFailureStreak: ok ? 0 : fatal ? FATAL_UNFOLLOW_STREAK : state.unfollowFailureStreak + 1,
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
          // A spinner saved mid-unfollow would never clear after the panel reopens.
          unfollowers: state.unfollowers && withoutTransientState(state.unfollowers),
          lastScannedAt: state.lastScannedAt,
          blockedUntil: state.blockedUntil,
          viewer: state.viewer,
          sortKey: resolveUserSortKey(state.sortKey),
          hiddenIds: state.hiddenIds,
          scanSpeed: state.scanSpeed,
          unfollowPacing: state.unfollowPacing,
          checkpoint: state.checkpoint,
        }),
        merge: (persisted, current) => {
          const stored = persisted as Partial<MainStore> | undefined;
          return {
            ...current,
            ...stored,
            // Older versions saved the spinner flag; drop it on load too.
            unfollowers: stored?.unfollowers ? withoutTransientState(stored.unfollowers) : current.unfollowers,
            sortKey: readStoredSortKey(),
            hiddenIds: stored?.hiddenIds && typeof stored.hiddenIds === 'object' ? stored.hiddenIds : {},
            scanSpeed: resolveScanSpeed(stored?.scanSpeed),
            unfollowPacing: normalizeUnfollowPacing(stored?.unfollowPacing),
          };
        },
      },
    ),
  ),
);
