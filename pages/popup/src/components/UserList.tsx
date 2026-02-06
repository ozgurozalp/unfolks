import React, { useMemo, useState } from 'react';
import Smiley from '@src/components/Smiley';
import type { User } from '@src/types';
import List, { ListItem } from '@src/components/List';
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@extension/ui';
import { useMainStore } from '@src/store';
import { useShallow } from 'zustand/react/shallow';
import { isEqual } from 'lodash';
import { Trans, useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';

interface Props {
  users: User[] | null;
}

const valueMap: Record<string, any> = {
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
      <p className="text-center text-sm">
        <Trans
          components={{ bold: <strong key="bold" /> }}
          i18nKey="unfollowersMessage"
          values={{ count: users?.length }}
        />
      </p>
      <Tabs value={tab} onValueChange={value => setSelectedTab(value as any)} className="w-full">
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
  type: 'all' | 'normal' | 'verified';
}

function WithoutMemoFiltered({ type, users }: FilteredProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const onlyVerified = valueMap[type];

  const filteredUsers = useMemo(() => {
    let _users = users;

    if (typeof onlyVerified === 'boolean') {
      _users = users.filter(user => user.isVerified === onlyVerified);
    }

    if (search.trim()) {
      _users = _users.filter(
        user =>
          user.full_name.toLowerCase().includes(search.toLowerCase()) ||
          user.username.toLowerCase().includes(search.toLowerCase()),
      );
    }

    return _users;
  }, [users, onlyVerified, search]);

  return (
    <>
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ boxShadow: 'none' }}
        placeholder={t('searchAccountPlaceholder')}
        className="mb-2"
      />
      <List className="grid">
        {search.trim() && filteredUsers.length === 0 && (
          <p className="mb-2 p-2 text-center text-base">{t('noResults')}</p>
        )}
        <AnimatePresence>
          {filteredUsers?.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 1 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ delay: (index < 10 ? index : 0) * 0.1 }}
              className="relative mb-2"
            >
              <ListItem
                user={user}
                className="rounded border p-2 shadow-md transition-all ease-in-out hover:scale-[1.01]"
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
