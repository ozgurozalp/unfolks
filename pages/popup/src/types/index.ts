import type { InstagramViewer } from '@extension/shared';

export interface Options {
  has_next_page?: boolean;
  end_cursor?: string;
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  image: string;
  unFollowLoading?: boolean;
  isFollowingMe: boolean;
  isPrivate: boolean;
  isVerified: boolean;
}

export type Request = {
  type: string;
  users?: User[];
  deletedId?: string;
  status?: boolean;
  errorMessage?: string;
  viewer?: InstagramViewer;
};
