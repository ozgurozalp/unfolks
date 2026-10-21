import { Avatar, AvatarFallback, AvatarImage } from '@extension/ui';
import type { InstagramViewer } from '@extension/shared';
import type { PropsWithChildren } from 'react';

interface ProfileCardProps {
  viewer?: InstagramViewer | null;
  action?: PropsWithChildren['children'];
}

export default function ProfileCard({ viewer, action }: ProfileCardProps) {
  return (
    <div className="flex w-full flex-col gap-3 border-b pb-4 roomy:flex-row roomy:items-center roomy:justify-between roomy:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {viewer && (
          <>
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
              {viewer.full_name && <p className="truncate text-xs text-muted-foreground">{viewer.username}</p>}
            </div>
          </>
        )}
      </div>
      {action ? <div className="w-full roomy:w-auto roomy:shrink-0">{action}</div> : null}
    </div>
  );
}
