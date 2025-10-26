export type ValueOf<T> = T[keyof T];

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
};

export enum TYPES {
  APP_STARTED = 'APP_STARTED',
  GET_PEOPLE = 'GET_PEOPLE',
  SET_PEOPLE = 'SET_PEOPLE',
  UNFOLLOW = 'UNFOLLOW',
  ERROR = 'ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  UNFOLLOWED = 'UNFOLLOWED',
  PAGE_CHECK = 'PAGE_CHECK',
  REDIRECT_TO_INSTAGRAM = 'REDIRECT_TO_INSTAGRAM',
  FOLLOWING_HASH = '3dec7e2c57367ef3da3d987d89f9dbc8',
  FOLLOWERS_HASH = '5aefa9893005572d237da5068082d8d5',
  CHECK_URL = 'CHECK_URL',
  IS_INSTAGRAM = 'IS_INSTAGRAM',
}
