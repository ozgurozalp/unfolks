import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import Smiley from '@src/components/Smiley';
import { resolveUserSortKey, sortUsers, type User } from '@extension/shared';
import List, { ListItem } from '@src/components/List';
import SortMenu from '@src/components/SortMenu';
import BulkActions from '@src/components/BulkActions';
import { cn, Input } from '@extension/ui';
import { useMainStore, type ListFilters, type VerifiedFilter } from '@src/store';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';

interface Props {
  users: User[] | null;
  lastScanNote?: ReactNode;
  /** A small action shown on the right of the "last scan" line. */
  secondaryAction?: ReactNode;
}

export default function UserList({ users, lastScanNote, secondaryAction }: Props) {
  const { t } = useTranslation();

  if (!users) return;

  const meta = (
    <div className="flex min-h-8 items-center justify-between gap-2">
      <div className="min-w-0 truncate">{lastScanNote}</div>
      {secondaryAction}
    </div>
  );

  if (users.length === 0) {
    return (
      <div className="mt-2 grid w-full gap-2">
        {meta}
        <div className="grid min-h-44 justify-items-center gap-2">
          <Smiley className="aspect-square size-28 max-w-full" />
          <p className="text-center text-lg font-semibold">
            <span className="text-2xl">{t('awesome')}</span>
            <br /> {t('noUnfollowersMessage')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 grid w-full grid-cols-[minmax(0,1fr)] gap-y-2">
      {meta}
      <Filtered users={users} />
    </div>
  );
}

interface FilteredProps {
  users: User[];
}

function applyFilters(users: readonly User[], filters: ListFilters, hiddenIds: Record<string, true>, query: string) {
  return users.filter(user => {
    if (Boolean(hiddenIds[user.id]) !== filters.showHidden) return false;
    if (filters.verified === 'verified' && !user.isVerified) return false;
    if (filters.verified === 'normal' && user.isVerified) return false;
    if (filters.onlyPrivate && !user.isPrivate) return false;
    if (filters.onlyNoAvatar && !user.hasNoAvatar) return false;
    if (!query) return true;
    return user.full_name.toLowerCase().includes(query) || user.username.toLowerCase().includes(query);
  });
}

function Filtered({ users }: FilteredProps) {
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
    const matching = applyFilters(users, filters, hiddenIds, query);
    try {
      return sortUsers(matching, sortKey, i18n.language);
    } catch {
      return matching;
    }
  }, [users, filters, hiddenIds, query, sortKey, i18n.language]);

  const selectedUsers = useMemo(() => filteredUsers.filter(user => selectedIds[user.id]), [filteredUsers, selectedIds]);
  const hiddenCount = useMemo(() => users.filter(user => hiddenIds[user.id]).length, [users, hiddenIds]);

  const toggleSelect = useCallback((id: string, selected: boolean) => setSelected([id], selected), [setSelected]);
  const toggleHidden = useCallback((id: string, hidden: boolean) => setHidden([id], hidden), [setHidden]);

  const noResults = filteredUsers.length === 0;

  return (
    <>
      <div className="flex items-center gap-2">
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
      {filters.showHidden && <p className="text-xs text-muted-foreground">{t('hiddenNote')}</p>}
      <BulkActions visible={filteredUsers} selected={selectedUsers} hiddenMode={filters.showHidden} />
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

interface Chip {
  id: string;
  label: string;
  active: boolean;
  onToggle: () => void;
}

/** Every list filter in one row of toggles. "Verified" and "Not verified" exclude each other. */
function FilterChips({ hiddenCount }: { hiddenCount: number }) {
  const { t } = useTranslation();
  const filters = useMainStore(state => state.filters);
  const setFilters = useMainStore(state => state.setFilters);

  const verifiedChip = (value: Exclude<VerifiedFilter, 'any'>, label: string): Chip => ({
    id: value,
    label,
    active: filters.verified === value,
    onToggle: () => setFilters({ verified: filters.verified === value ? 'any' : value }),
  });
  const toggleChip = (key: 'onlyPrivate' | 'onlyNoAvatar' | 'showHidden', label: string): Chip => ({
    id: key,
    label,
    active: filters[key],
    onToggle: () => setFilters({ [key]: !filters[key] }),
  });

  const chips: Chip[] = [
    verifiedChip('verified', t('filterVerified')),
    verifiedChip('normal', t('filterNotVerified')),
    toggleChip('onlyPrivate', t('filterPrivate')),
    toggleChip('onlyNoAvatar', t('filterNoAvatar')),
    ...(hiddenCount > 0 || filters.showHidden
      ? [toggleChip('showHidden', t('filterHidden', { count: hiddenCount }))]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {chips.map(chip => (
        <button
          key={chip.id}
          type="button"
          aria-pressed={chip.active}
          onClick={chip.onToggle}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs transition-colors',
            chip.active
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
