import { Select } from '@base-ui/react/select';
import { resolveUserSortKey, USER_SORT_GROUPS, type UserSortKey } from '@extension/shared';
import { Button } from '@extension/ui';
import { useMainStore } from '@src/store';
import { useTranslation } from 'react-i18next';
import { ArrowDownUp, Check, ChevronDown } from 'lucide-react';

const SORT_LABEL_KEYS: Record<UserSortKey, string> = {
  'followed-desc': 'sortFollowedNewest',
  'followed-asc': 'sortFollowedOldest',
  'name-asc': 'sortNameAsc',
  'name-desc': 'sortNameDesc',
  'username-asc': 'sortUsernameAsc',
  'username-desc': 'sortUsernameDesc',
  'account-desc': 'sortAccountNewest',
  'account-asc': 'sortAccountOldest',
};

const SORT_GROUP_LABEL_KEYS: Record<(typeof USER_SORT_GROUPS)[number]['id'], string> = {
  followed: 'sortGroupFollowed',
  name: 'sortGroupName',
  username: 'sortGroupUsername',
  account: 'sortGroupAccount',
};

export default function SortMenu() {
  const { t } = useTranslation();
  const sortKey = useMainStore(state => resolveUserSortKey(state.sortKey));
  const setSortKey = useMainStore(state => state.setSortKey);
  const currentLabel = t(SORT_LABEL_KEYS[sortKey]);

  return (
    <Select.Root
      value={sortKey}
      modal={false}
      onValueChange={value => {
        if (value == null) return;
        setSortKey(resolveUserSortKey(value));
      }}
    >
      <Select.Trigger
        aria-label={`${t('sortBy')}: ${currentLabel}`}
        render={
          <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 justify-between gap-1.5 px-2.5" />
        }
      >
        <ArrowDownUp className="size-3.5" />
        <Select.Value className="max-w-[8.5rem] truncate">
          {(value: UserSortKey | null) => t(SORT_LABEL_KEYS[resolveUserSortKey(value)])}
        </Select.Value>
        <Select.Icon>
          <ChevronDown className="size-3.5 opacity-60" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="z-50 outline-none"
          alignItemWithTrigger={false}
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={8}
        >
          <Select.Popup className="max-h-[min(20rem,var(--available-height))] min-w-52 origin-[var(--transform-origin)] overflow-hidden overscroll-contain rounded-lg border bg-background p-1.5 text-foreground shadow-lg outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <Select.List className="max-h-[calc(min(20rem,var(--available-height))-0.75rem)] overflow-y-auto overscroll-contain outline-none">
              {USER_SORT_GROUPS.map((group, index) => (
                <Select.Group key={group.id}>
                  {index > 0 && <Select.Separator className="m-1 h-px bg-border" />}
                  <Select.GroupLabel className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t(SORT_GROUP_LABEL_KEYS[group.id])}
                  </Select.GroupLabel>
                  {group.keys.map(key => (
                    <Select.Item
                      key={key}
                      value={key}
                      label={t(SORT_LABEL_KEYS[key])}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <Select.ItemIndicator>
                          <Check className="size-3.5" />
                        </Select.ItemIndicator>
                      </span>
                      <Select.ItemText>{t(SORT_LABEL_KEYS[key])}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
