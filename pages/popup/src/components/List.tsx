import React, { type ReactNode } from 'react';
import openWindow from '@src/helpers/openWindow';
import type { User } from '@src/types';
import { useMainStore } from '@src/store';
import { Avatar, AvatarFallback, AvatarImage, Button, cn, Spinner } from '@extension/ui';
import { useTranslation } from 'react-i18next';
import { useRateLimitedUnfollow } from '@src/hooks/useRateLimitedUnfollow';

interface ListProps {
  children: ReactNode;
  className?: string;
}

const openProfile = (userName: string) => {
  openWindow(`https://www.instagram.com/${userName}`);
};

export default function List({ children, ...props }: ListProps) {
  return <div {...props}>{children}</div>;
}

interface ListItemProps {
  user: User;
  className?: string;
}

export function ListItem({ user, className }: ListItemProps) {
  const { isInstagram } = useMainStore();
  const { t } = useTranslation();
  const { unfollow } = useRateLimitedUnfollow();

  return (
    <div className={className}>
      <figure className="flex items-center gap-3">
        <Avatar className="size-11">
          <AvatarFallback>{user.full_name.slice(0, 1)}</AvatarFallback>
          <AvatarImage crossOrigin="anonymous" draggable="false" src={user.image} alt={user.username} />
        </Avatar>

        <figcaption role="button" className="grid cursor-pointer" onClick={() => openProfile(user.username)}>
          <div className="inline-flex items-center gap-1 font-bold">
            {user.full_name && (
              <p title={user.full_name} className="max-w-[20ch] truncate text-sm">
                {user.full_name}
              </p>
            )}
            {user.isVerified && user.full_name && <Verified />}
          </div>
          <div className="inline-flex items-center gap-1">
            <p className="text-muted-foreground">{user.username}</p>
            {user.isVerified && !user.full_name && <Verified />}
          </div>
        </figcaption>

        {isInstagram && (
          <Button
            variant="outline"
            size="sm"
            disabled={user.unFollowLoading}
            onClick={() => unfollow(user)}
            className="relative ml-auto whitespace-nowrap"
          >
            <Spinner className={cn('absolute inset-0 m-auto size-4', !user.unFollowLoading && 'hidden')} />
            <span className={cn(user.unFollowLoading && 'opacity-10')}>{t('unfollow')}</span>
          </Button>
        )}
      </figure>
    </div>
  );
}

function Verified() {
  return (
    <svg
      aria-label="Verified"
      color="rgb(0, 149, 246)"
      fill="rgb(0, 149, 246)"
      height="1em"
      role="img"
      viewBox="0 0 40 40"
      width="1em"
    >
      <title>Verified</title>
      <path
        d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z"
        fillRule="evenodd"
      />
    </svg>
  );
}
