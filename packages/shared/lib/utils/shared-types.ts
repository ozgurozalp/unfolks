import type { ScanSpeed } from './pacing';

export type ValueOf<T> = T[keyof T];

export interface User {
  id: string;
  username: string;
  full_name: string;
  image: string;
  unFollowLoading?: boolean;
  isFollowingMe: boolean;
  isPrivate: boolean;
  isVerified: boolean;
  /** Position in Instagram's following list (0 = most recently followed). */
  followIndex?: number;
  /** Account creation time in ms, when Instagram sends it. */
  accountCreatedAt?: number;
  /** Instagram reports the default (blank) profile picture. */
  hasNoAvatar?: boolean;
}

export type ProgressPhase = 'following' | 'followers';

export interface ScanProgress {
  phase: ProgressPhase;
  current: number;
  total: number;
  /** Set while Instagram is rate-limiting the scan. The scan keeps waiting. */
  retryInMs?: number;
  /** The Instagram tab is in the background, where Chrome slows timers down. */
  tabHidden?: boolean;
}

/** Why a scan stopped before it finished. The progress so far is kept for Resume. */
export type ScanStopReason = 'rate' | 'blocked' | 'gap' | 'limited' | 'auth' | 'error';

/** What the panel needs to offer "Resume" for a scan that stopped partway. */
export interface CheckpointSummary {
  viewerId: string;
  savedAt: number;
  /** Accounts collected from the following list so far. */
  loaded: number;
  /** Following count Instagram reported, when known. */
  total: number | null;
  /** Resume sends no request before this time (ms). 0 when there is no wait. */
  cooldownUntil: number;
  stopReason?: ScanStopReason;
}

export type Request = {
  type: string;
  users?: User[];
  /** UNFOLLOW and its replies: the account acted on. */
  user?: User;
  deletedId?: string;
  status?: boolean;
  errorMessage?: string;
  viewer?: ViewerProfile;
  phase?: ProgressPhase;
  current?: number;
  total?: number;
  retryInMs?: number;
  cooldownMs?: number;
  /** SET_PEOPLE: some accounts could not be verified and were left out. */
  incomplete?: boolean;
  /** UNFOLLOW: the account the list was scanned with. */
  expectedViewer?: Pick<InstagramViewer, 'id' | 'username'>;
  /** GET_PEOPLE: continue from the saved checkpoint instead of starting over. */
  resume?: boolean;
  /** GET_PEOPLE: how fast to page through Instagram's lists. */
  scanSpeed?: ScanSpeed;
  tabHidden?: boolean;
  /** SCAN_STOPPED: why the scan stopped. */
  stopReason?: ScanStopReason;
  /** SCAN_STOPPED / ERROR: one line with version, position and what Instagram sent. */
  errorDetail?: string;
  /** LOGS_REPORT: the plain-text report to put in the email. */
  report?: string;
  /** Set by the background on messages that waited for the panel to reopen. */
  deliveredLate?: boolean;
  /** SCAN_STOPPED / CHECKPOINT_INFO: the saved progress, or null when there is none. */
  checkpoint?: CheckpointSummary | null;
};

export enum TYPES {
  GET_PEOPLE = 'GET_PEOPLE',
  SET_PEOPLE = 'SET_PEOPLE',
  PROGRESS = 'PROGRESS',
  UNFOLLOW = 'UNFOLLOW',
  ERROR = 'ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  ACTION_BLOCKED = 'ACTION_BLOCKED',
  UNFOLLOWED = 'UNFOLLOWED',
  GET_VIEWER_DATA = 'GET_VIEWER_DATA',
  SET_VIEWER_DATA = 'SET_VIEWER_DATA',
  GET_SCAN_STATE = 'GET_SCAN_STATE',
  SCAN_STOPPED = 'SCAN_STOPPED',
  GET_CHECKPOINT = 'GET_CHECKPOINT',
  CHECKPOINT_INFO = 'CHECKPOINT_INFO',
  DISCARD_CHECKPOINT = 'DISCARD_CHECKPOINT',
  CANCEL_SCAN = 'CANCEL_SCAN',
  SCAN_CANCELLED = 'SCAN_CANCELLED',
  SEND_LOGS = 'SEND_LOGS',
  LOGS_REPORT = 'LOGS_REPORT',
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

/** The only profile fields the extension keeps: what the profile card and account checks need. */
export type ViewerProfile = Pick<
  InstagramViewer,
  'id' | 'fbid' | 'username' | 'full_name' | 'profile_pic_url' | 'profile_pic_url_hd'
>;

export function toViewerProfile(viewer: ViewerProfile): ViewerProfile {
  return {
    id: viewer.id,
    fbid: viewer.fbid,
    username: viewer.username,
    full_name: viewer.full_name,
    profile_pic_url: viewer.profile_pic_url,
    profile_pic_url_hd: viewer.profile_pic_url_hd,
  };
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
