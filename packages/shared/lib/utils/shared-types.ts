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
  GET_VIEWER_DATA = 'GET_VIEWER_DATA',
  SET_VIEWER_DATA = 'SET_VIEWER_DATA',
}

export interface InstagramSharedData {
  config: InstagramConfig;
  country_code: string;
  language_code: string;
  locale: string;
  entry_data: Record<string, unknown>;
  hostname: string;
  is_whitelisted_crawl_bot: boolean;
  connection_quality_rating: string;
  deployment_stage: string;
  platform: string;
  nonce: string;
  mid_pct: number;
  zero_data: Record<string, unknown>;
  cache_schema_version: number;
  server_checks: Record<string, unknown>;
  knobx: Record<string, unknown>;
  to_cache: InstagramCacheData;
  device_id: string;
  browser_push_pub_key: string;
  encryption: InstagramEncryption;
  is_dev: boolean;
  signal_collection_config: SignalCollectionConfig;
  consent_dialog_config: ConsentDialogConfig;
  privacy_flow_trigger: PrivacyFlowTrigger;
  www_routing_config: WwwRoutingConfig;
  rollout_hash: string;
  bundle_variant: string | null;
  frontend_env: string;
}

interface InstagramConfig {
  csrf_token: string;
  viewer: InstagramViewer;
  viewerId: string;
}

export interface InstagramViewer {
  biography: string;
  business_address_json: string | null;
  business_contact_method: string;
  business_email: string | null;
  business_phone_number: string | null;
  can_see_organic_insights: boolean;
  category_name: string | null;
  external_url: string;
  fbid: string;
  full_name: string;
  has_phone_number: boolean;
  has_profile_pic: boolean;
  has_tabbed_inbox: boolean;
  hide_like_and_view_counts: boolean;
  id: string;
  is_business_account: boolean;
  is_joined_recently: boolean;
  is_supervised_user: boolean;
  guardian_id: string | null;
  is_private: boolean;
  is_professional_account: boolean;
  is_supervision_enabled: boolean;
  is_user_in_canada: boolean;
  profile_pic_url: string;
  profile_pic_url_hd: string;
  should_show_category: boolean;
  should_show_public_contacts: boolean;
  username: string;
  badge_count: string;
}

interface InstagramEncryption {
  key_id: string;
  public_key: string;
  version: string;
}

interface InstagramCacheData {
  gatekeepers: Record<string, unknown>;
  qe: Record<string, QeExperiment>;
  probably_has_app: boolean;
}

interface QeExperiment {
  g: string;
  p: Record<string, string>;
}

interface SignalCollectionConfig {
  bbs: number;
  ctw: number | null;
  dbs: number;
  fd: number;
  hbc: HbcConfig;
  i: number;
  rt: number | null;
  sbs: number;
  sc: ScConfig;
  sid: number;
}

interface HbcConfig {
  hbbi: number;
  hbcbc: number;
  hbi: number;
  hbv: string;
  hbvbc: number;
}

interface ScConfig {
  c: [number, number][];
  t: number;
}

interface ConsentDialogConfig {
  is_user_linked_to_fb: boolean;
  should_show_consent_dialog: boolean;
}

interface PrivacyFlowTrigger {
  consent_flow_extra_params: unknown | null;
  consent_flow_name: string | null;
  flow_name: string | null;
  mobile_deeplink: string | null;
  trigger_behavior: string | null;
  ttl: number;
  web_exclude_paths: string[];
}

interface WwwRoutingConfig {
  frontend_and_proxygen_routes: FrontendProxygenRoute[];
  frontend_only_routes: FrontendOnlyRoute[];
  proxygen_request_handler_only_routes: ProxygenRequestHandlerRoute[];
}

type RouteDestination = 'WWW' | 'DISTILLERY' | 'BOTH';

interface RouteApp {
  name: string;
  gk: string;
}

interface FrontendProxygenRoute {
  path: string;
  destination: RouteDestination;
  apps?: RouteApp[];
}

interface FrontendOnlyRoute {
  path: string;
  destination: RouteDestination;
}

interface ProxygenRequestHandlerRoute {
  paths: string[];
  destination: RouteDestination;
  in_vpn_dogfooding: boolean;
  in_qe: boolean;
}
