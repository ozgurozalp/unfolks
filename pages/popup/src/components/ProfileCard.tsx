import { Avatar, AvatarFallback, AvatarImage } from '@extension/ui';
import type { InstagramViewer } from '@extension/shared';
import type { PropsWithChildren } from 'react';

interface ProfileCardProps {
  viewer: InstagramViewer;
  action?: PropsWithChildren['children'];
}

export default function ProfileCard({ viewer, action }: ProfileCardProps) {
  return (
    <div className={'flex w-full flex-1 justify-between gap-4 border-b pb-4'}>
      <div className="flex items-center gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarFallback className="text-lg">
            {viewer.full_name?.slice(0, 1) || viewer.username.slice(0, 1)}
          </AvatarFallback>
          <AvatarImage
            crossOrigin="anonymous"
            draggable="false"
            src={viewer.profile_pic_url_hd || viewer.profile_pic_url}
            alt={viewer.username}
          />
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{viewer.full_name || viewer.username}</p>
          {viewer.full_name && <p className="text-muted-foreground truncate text-xs">{viewer.username}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
