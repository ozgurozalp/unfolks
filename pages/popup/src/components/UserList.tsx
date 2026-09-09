import React, { useDeferredValue, useMemo, useState } from 'react';
import Smiley from '@src/components/Smiley';
import type { User } from '@extension/shared';
import List, { ListItem } from '@src/components/List';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Input,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@extension/ui';
import { useMainStore, type Tab } from '@src/store';
import { useShallow } from 'zustand/react/shallow';
import { isEqual } from 'lodash';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { useRateLimitedUnfollow } from '@src/hooks/useRateLimitedUnfollow';
import { UserX, X } from 'lucide-react';

interface Props {
  users: User[] | null;
}

const verifiedFilterByTab: Record<Tab, boolean | undefined> = {
  all: undefined,
  normal: false,
  verified: true,
};

export default function UserList({ users }: Props) {
  const tab = useMainStore(useShallow(state => state.selectedTab));
  const setSelectedTab = useMainStore(useShallow(state => state.setSelectedTab));
  const { t } = useTranslation();

  if (!users) return;

  if (users.length === 0) {
    return (
      <div className="grid h-44 w-full justify-items-center gap-2">
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
      <Tabs value={tab} onValueChange={value => setSelectedTab(value as Tab)} className="w-full">
        <TabsList className="mx-auto grid w-fit grid-cols-[auto_auto_auto] gap-x-1">
          <TabsTrigger className="h-full" value="all">
            {t('allAccounts')}
          </TabsTrigger>
          <TabsTrigger className="h-full" value="verified">
            {t('verifiedAccounts')}
          </TabsTrigger>
          <TabsTrigger className="h-full" value="normal">
            {t('normalAccounts')}
          </TabsTrigger>
        </TabsList>
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

function WithoutMemoFiltered({ type, users }: FilteredProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  // Deferring the search term keeps the input responsive and avoids re-running
  // the list enter/exit animation on every keystroke.
  const deferredSearch = useDeferredValue(search);
  const onlyVerified = verifiedFilterByTab[type];

  const filteredUsers = useMemo(() => {
    let _users = users;

    if (typeof onlyVerified === 'boolean') {
      _users = users.filter(user => user.isVerified === onlyVerified);
    }

    const query = deferredSearch.trim().toLowerCase();
    if (query) {
      _users = _users.filter(
        user => user.full_name.toLowerCase().includes(query) || user.username.toLowerCase().includes(query),
      );
    }

    return _users;
  }, [users, onlyVerified, deferredSearch]);

  const noResults = deferredSearch.trim().length > 0 && filteredUsers.length === 0;

  return (
    <>
      <BulkUnfollowBar users={filteredUsers} />
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ boxShadow: 'none' }}
        placeholder={t('searchAccountPlaceholder')}
        className="mb-2"
      />
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
                className="rounded border p-2 shadow-md transition-transform duration-150 ease-out hover:scale-[1.01]"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </List>
    </>
  );
}

const Filtered = React.memo(WithoutMemoFiltered, (prev: FilteredProps, next: FilteredProps) => {
  return isEqual(prev.users, next.users) && prev.type === next.type;
});

function BulkUnfollowBar({ users }: { users: User[] }) {
  const { t } = useTranslation();
  const isInstagram = useMainStore(useShallow(state => state.isInstagram));
  const blockedUntil = useMainStore(useShallow(state => state.blockedUntil));
  const { startBulk, cancelBulk, bulkState } = useRateLimitedUnfollow();

  const isBlocked = typeof blockedUntil === 'number' && blockedUntil > Date.now();

  if (!isInstagram) return null;

  if (bulkState) {
    const percent = bulkState.total > 0 ? Math.round((bulkState.done / bulkState.total) * 100) : 0;
    return (
      <div className="mb-2 flex items-center gap-2 rounded border bg-muted/40 p-2">
        <Spinner className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t('bulkUnfollowing', { done: bulkState.done, total: bulkState.total })}
          </p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={cancelBulk}>
          <X className="size-3" />
          {t('cancel')}
        </Button>
      </div>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        disabled={isBlocked || users.length === 0}
        render={<Button variant="outline" size="sm" className="mb-2 w-full justify-center" />}
      >
        <UserX className="size-3" />
        {t('unfollowAll', { count: users.length })}
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20">
            <UserX className="size-6" strokeWidth={1.75} />
          </div>
          <AlertDialogTitle>{t('unfollowAllTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('unfollowAllDescription', { count: users.length })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>{t('cancel')}</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" />} onClick={() => startBulk(users)}>
            {t('unfollowAllAction')}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
