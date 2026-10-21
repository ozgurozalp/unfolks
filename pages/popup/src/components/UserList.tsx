import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import Smiley from '@src/components/Smiley';
import { resolveUserSortKey, sortUsers, type User } from '@extension/shared';
import List, { ListItem } from '@src/components/List';
import SortMenu from '@src/components/SortMenu';
import BulkActions from '@src/components/BulkActions';
import { cn, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@extension/ui';
import { useMainStore, type ListFilters, type Tab } from '@src/store';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';

interface Props {
  users: User[] | null;
  lastScanNote?: ReactNode;
}

/** Narrow panels wrap tab labels onto two lines instead of pushing the row wider than the panel. */
const tabTriggerClass =
  'h-full min-w-0 whitespace-normal px-2 text-center text-xs leading-tight roomy:whitespace-nowrap roomy:px-3 roomy:text-sm';

const verifiedFilterByTab: Record<Tab, boolean | undefined> = {
  all: undefined,
  normal: false,
  verified: true,
};

export default function UserList({ users, lastScanNote }: Props) {
  const tab = useMainStore(useShallow(state => state.selectedTab));
  const setSelectedTab = useMainStore(useShallow(state => state.setSelectedTab));
  const clearSelection = useMainStore(state => state.clearSelection);
  const { t } = useTranslation();

  if (!users) return;

  if (users.length === 0) {
    return (
      <div className="grid min-h-44 w-full justify-items-center gap-2">
        {lastScanNote}
        <Smiley className="aspect-square size-28 max-w-full" />
        <p className="text-center text-lg font-semibold">
          <span className="text-2xl">{t('awesome')}</span>
          <br /> {t('noUnfollowersMessage')}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 grid w-full gap-y-3">
      <Tabs
        value={tab}
        onValueChange={value => {
          // A selection made on another tab would act on accounts no longer shown.
          clearSelection();
          setSelectedTab(value as Tab);
        }}
        className="w-full"
      >
        {/* Wide panels fit both on one row, so the note moves from above the tabs to their right. */}
        <div className="flex flex-col items-center gap-2 wide:flex-row-reverse wide:justify-between">
          {lastScanNote}
          <TabsList className="grid h-auto min-h-10 w-full grid-cols-3 gap-x-1 roomy:w-fit roomy:grid-cols-[auto_auto_auto]">
            <TabsTrigger className={tabTriggerClass} value="all">
              {t('allAccounts')}
            </TabsTrigger>
            <TabsTrigger className={tabTriggerClass} value="verified">
              {t('verifiedAccounts')}
            </TabsTrigger>
            <TabsTrigger className={tabTriggerClass} value="normal">
              {t('normalAccounts')}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="all">
          <Filtered users={users} type="all" />
        </TabsContent>
        <TabsContent value="normal">
          <Filtered users={users} type="normal" />
        </TabsContent>
        <TabsContent value="verified">
          <Filtered users={users} type="verified" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface FilteredProps {
  users: User[];
  type: Tab;
}

function applyFilters(
  users: readonly User[],
  onlyVerified: boolean | undefined,
  filters: ListFilters,
  hiddenIds: Record<string, true>,
  query: string,
) {
  return users.filter(user => {
    if (Boolean(hiddenIds[user.id]) !== filters.showHidden) return false;
    if (typeof onlyVerified === 'boolean' && user.isVerified !== onlyVerified) return false;
    if (filters.onlyPrivate && !user.isPrivate) return false;
    if (filters.onlyNoAvatar && !user.hasNoAvatar) return false;
    if (!query) return true;
    return user.full_name.toLowerCase().includes(query) || user.username.toLowerCase().includes(query);
  });
}

function Filtered({ type, users }: FilteredProps) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  // Deferring the search term keeps the input responsive and avoids re-running
  // the list enter/exit animation on every keystroke.
  const deferredSearch = useDeferredValue(search);
  const sortKey = useMainStore(state => resolveUserSortKey(state.sortKey));
  const hiddenIds = useMainStore(state => state.hiddenIds);
  const selectedIds = useMainStore(state => state.selectedIds);
  const filters = useMainStore(state => state.filters);
  const setSelected = useMainStore(state => state.setSelected);
  const setHidden = useMainStore(state => state.setHidden);
  const query = deferredSearch.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    const matching = applyFilters(users, verifiedFilterByTab[type], filters, hiddenIds, query);
    try {
      return sortUsers(matching, sortKey, i18n.language);
    } catch {
      return matching;
    }
  }, [users, type, filters, hiddenIds, query, sortKey, i18n.language]);

  const selectedUsers = useMemo(() => filteredUsers.filter(user => selectedIds[user.id]), [filteredUsers, selectedIds]);
  const hiddenCount = useMemo(() => users.filter(user => hiddenIds[user.id]).length, [users, hiddenIds]);

  const toggleSelect = useCallback((id: string, selected: boolean) => setSelected([id], selected), [setSelected]);
  const toggleHidden = useCallback((id: string, hidden: boolean) => setHidden([id], hidden), [setHidden]);

  const noResults = filteredUsers.length === 0;

  return (
    <>
      <BulkActions visible={filteredUsers} selected={selectedUsers} hiddenMode={filters.showHidden} />
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ boxShadow: 'none' }}
          placeholder={t('searchAccountPlaceholder')}
          className="min-w-0 flex-1"
          aria-label={t('searchAccountPlaceholder')}
        />
        <SortMenu />
      </div>
      <FilterChips hiddenCount={hiddenCount} />
      {filters.showHidden && <p className="mb-2 text-xs text-muted-foreground">{t('hiddenNote')}</p>}
      <List className="grid">
        <AnimatePresence mode="popLayout" initial={false}>
          {noResults && (
            <motion.p
              key="no-results"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="mb-2 p-2 text-center text-base text-muted-foreground"
            >
              {t('noResults')}
            </motion.p>
          )}
          {filteredUsers.map(user => (
            <motion.div
              key={user.id}
              layout="position"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{
                opacity: { duration: 0.15, ease: 'easeOut' },
                y: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                scale: { duration: 0.15, ease: 'easeOut' },
                layout: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
              }}
              className="relative mb-2 will-change-transform"
            >
              <ListItem
                user={user}
                isSelected={Boolean(selectedIds[user.id])}
                isHidden={Boolean(hiddenIds[user.id])}
                onToggleSelect={toggleSelect}
                onToggleHidden={toggleHidden}
                className="rounded border p-2 shadow-md transition-transform duration-150 ease-out hover:scale-[1.01]"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </List>
    </>
  );
}

function FilterChips({ hiddenCount }: { hiddenCount: number }) {
  const { t } = useTranslation();
  const filters = useMainStore(state => state.filters);
  const setFilters = useMainStore(state => state.setFilters);

  const chips: { key: keyof ListFilters; label: string; hidden?: boolean }[] = [
    { key: 'onlyPrivate', label: t('filterPrivate') },
    { key: 'onlyNoAvatar', label: t('filterNoAvatar') },
    {
      key: 'showHidden',
      label: t('filterHidden', { count: hiddenCount }),
      hidden: hiddenCount === 0 && !filters.showHidden,
    },
  ];

  return (
    <div className="mb-2 flex flex-wrap gap-1.5" role="group">
      {chips
        .filter(chip => !chip.hidden)
        .map(chip => {
          const active = filters[chip.key];
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilters({ [chip.key]: !active })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {chip.label}
            </button>
          );
        })}
    </div>
  );
}
