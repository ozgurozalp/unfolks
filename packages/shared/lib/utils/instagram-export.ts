/**
 * Offline analysis of Instagram's "Download your information" export.
 * Everything runs locally: a tiny dependency-free ZIP reader pulls only the
 * followers/following files out of the archive, then we diff the two lists.
 */

export interface ExportAccount {
  /** Lowercase, no '@'. */
  username: string;
  /** Milliseconds since epoch, when Instagram gave a timestamp. */
  followedAt?: number;
}

export interface ExportResult {
  followersCount: number;
  followingCount: number;
  /** Following minus followers: newest `followedAt` first, then undated ones A–Z. */
  nonFollowers: ExportAccount[];
}

export type ExportErrorCode =
  | 'notZip'
  | 'zip64'
  | 'badZip'
  | 'encrypted'
  | 'unsupportedCompression'
  | 'noFollowers'
  | 'noFollowing'
  | 'parse';

export class ExportError extends Error {
  code: ExportErrorCode;
  detail: string;

  constructor(code: ExportErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ExportError';
    this.code = code;
    this.detail = detail;
  }
}

export interface ExportFile {
  /** File name or relative path (webkitRelativePath when a folder is dropped). */
  path: string;
  blob: Blob;
}

export type ExportFileKind = 'followers' | 'following';

// ---------------------------------------------------------------------------
// File classification & parsing
// ---------------------------------------------------------------------------

/** `followers_1.json`, `following.html`, also browser duplicates like `following (1).json`. */
const FOLLOWERS_NAME = /^followers(?:_\d+)?(?: ?\(\d+\))?\.(?:json|html?)$/;
const FOLLOWING_NAME = /^following(?:_\d+)?(?: ?\(\d+\))?\.(?:json|html?)$/;
const USERNAME = /^[a-z0-9._]{1,30}$/;
const RESERVED_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'explore',
  'accounts',
  'stories',
  'direct',
  'about',
  'legal',
  'developer',
  'web',
  'tv',
  '_u',
  '_n',
]);
const PROFILE_HREF = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:_u\/)?([^/?#"'\s<>]+)/i;
const HTML_HREF = /href\s*=\s*["']?(https?:\/\/(?:www\.|m\.)?instagram\.com\/[^"'\s>]*)/gi;
/** Timestamps above this are already milliseconds (seconds would mean year ~33658). */
const MS_THRESHOLD = 1e12;

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

/** Which relationship list a path holds, judged by its file name only. */
export function classifyExportPath(path: string): ExportFileKind | null {
  const name = baseName(path);
  if (FOLLOWERS_NAME.test(name)) return 'followers';
  if (FOLLOWING_NAME.test(name)) return 'following';
  return null;
}

function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lowercased username when it is a plausible Instagram handle, otherwise undefined. */
export function normalizeUsername(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const username = raw.trim().replace(/^@/, '').toLowerCase();
  if (!USERNAME.test(username) || RESERVED_SEGMENTS.has(username)) return undefined;
  return username;
}

/** Username from `https://www.instagram.com/name` or `https://www.instagram.com/_u/name`. */
export function usernameFromHref(href: unknown): string | undefined {
  if (typeof href !== 'string') return undefined;
  const match = PROFILE_HREF.exec(href.trim());
  return match ? normalizeUsername(match[1]) : undefined;
}

function toMillis(timestamp: unknown): number | undefined {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return timestamp >= MS_THRESHOLD ? timestamp : timestamp * 1000;
}

function entryToAccount(entry: unknown): ExportAccount | undefined {
  if (!isRecord(entry)) return undefined;
  const items = Array.isArray(entry.string_list_data) ? entry.string_list_data : [];
  const first: Record<string, unknown> = isRecord(items[0]) ? items[0] : {};
  const username = normalizeUsername(first.value) ?? normalizeUsername(entry.title) ?? usernameFromHref(first.href);
  if (!username) return undefined;
  const followedAt = toMillis(first.timestamp);
  return followedAt === undefined ? { username } : { username, followedAt };
}

/** Bare array, or the arrays under any `relationships_*` key. Null when the shape is unknown. */
function relationshipEntries(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return null;
  const lists = Object.entries(data)
    .filter(([key, value]) => key.startsWith('relationships_') && Array.isArray(value))
    .map(([, value]) => value as unknown[]);
  return lists.length > 0 ? lists.flat() : null;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse a followers/following JSON file. Throws `ExportError('parse')` on bad input. */
export function parseExportJson(text: string, path = 'json'): ExportAccount[] {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text));
  } catch {
    throw new ExportError('parse', path);
  }
  const entries = relationshipEntries(data);
  if (!entries) throw new ExportError('parse', path);
  return entries.map(entryToAccount).filter((account): account is ExportAccount => account !== undefined);
}

/** Usernames from instagram.com profile links in an HTML export (dates are not extracted). */
export function parseExportHtml(text: string): ExportAccount[] {
  const usernames = Array.from(text.matchAll(HTML_HREF), match => usernameFromHref(match[1]));
  return usernames.filter((name): name is string => name !== undefined).map(username => ({ username }));
}

export function parseExportText(text: string, path: string): ExportAccount[] {
  return isHtmlPath(path) ? parseExportHtml(text) : parseExportJson(text, path);
}

/** Merge duplicates (split files, repeated links), keeping the newest timestamp. */
function dedupeAccounts(accounts: readonly ExportAccount[]): Map<string, ExportAccount> {
  const byName = new Map<string, ExportAccount>();
  for (const account of accounts) {
    const existing = byName.get(account.username);
    if (!existing || (account.followedAt ?? -1) > (existing.followedAt ?? -1)) byName.set(account.username, account);
  }
  return byName;
}

function compareAccounts(a: ExportAccount, b: ExportAccount): number {
  if (a.followedAt !== undefined && b.followedAt !== undefined && a.followedAt !== b.followedAt) {
    return b.followedAt - a.followedAt;
  }
  if (a.followedAt !== undefined && b.followedAt === undefined) return -1;
  if (a.followedAt === undefined && b.followedAt !== undefined) return 1;
  return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
}

export function computeExportResult(
  followers: readonly ExportAccount[],
  following: readonly ExportAccount[],
): ExportResult {
  const followerMap = dedupeAccounts(followers);
  const followingMap = dedupeAccounts(following);
  const nonFollowers = [...followingMap.values()]
    .filter(account => !followerMap.has(account.username))
    .sort(compareAccounts);
  return { followersCount: followerMap.size, followingCount: followingMap.size, nonFollowers };
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (Blob.slice based, never loads the whole archive)
// ---------------------------------------------------------------------------

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;
const FLAG_ENCRYPTED = 0x1;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

async function readBytes(blob: Blob, start: number, end: number): Promise<DataView> {
  if (start < 0 || end > blob.size || start > end) throw new ExportError('badZip', 'out of range read');
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

export function isZipFile(file: ExportFile): boolean {
  return /\.zip$/i.test(file.path) || file.blob.type.includes('zip');
}

async function findEocd(blob: Blob): Promise<DataView> {
  const start = Math.max(0, blob.size - EOCD_SIZE - MAX_COMMENT);
  const tail = await readBytes(blob, start, blob.size);
  for (let i = tail.byteLength - EOCD_SIZE; i >= 0; i--) {
    if (tail.getUint32(i, true) !== SIG_EOCD) continue;
    if (i + EOCD_SIZE + tail.getUint16(i + 20, true) > tail.byteLength) continue;
    return new DataView(tail.buffer, i, EOCD_SIZE);
  }
  const head = blob.size >= 4 ? await readBytes(blob, 0, 4) : null;
  const looksLikeZip = head !== null && head.getUint32(0, true) === SIG_LOCAL;
  throw new ExportError(looksLikeZip ? 'badZip' : 'notZip', 'end of central directory not found');
}

function readCentralEntry(view: DataView, offset: number, decoder: TextDecoder): [ZipEntry, number] {
  if (offset + CENTRAL_HEADER_SIZE > view.byteLength || view.getUint32(offset, true) !== SIG_CENTRAL) {
    throw new ExportError('badZip', 'bad central directory entry');
  }
  const nameLength = view.getUint16(offset + 28, true);
  const extraLength = view.getUint16(offset + 30, true);
  const commentLength = view.getUint16(offset + 32, true);
  const nameStart = view.byteOffset + offset + CENTRAL_HEADER_SIZE;
  if (offset + CENTRAL_HEADER_SIZE + nameLength > view.byteLength) throw new ExportError('badZip', 'name overflow');
  const entry: ZipEntry = {
    name: decoder.decode(new Uint8Array(view.buffer, nameStart, nameLength)),
    flags: view.getUint16(offset + 8, true),
    method: view.getUint16(offset + 10, true),
    compressedSize: view.getUint32(offset + 20, true),
    uncompressedSize: view.getUint32(offset + 24, true),
    localHeaderOffset: view.getUint32(offset + 42, true),
  };
  return [entry, offset + CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength];
}

/** List every entry in the archive's central directory. */
export async function readZipEntries(blob: Blob): Promise<ZipEntry[]> {
  const eocd = await findEocd(blob);
  const entryCount = eocd.getUint16(10, true);
  const cdSize = eocd.getUint32(12, true);
  const cdOffset = eocd.getUint32(16, true);
  if (entryCount === U16_MAX || cdSize === U32_MAX || cdOffset === U32_MAX) throw new ExportError('zip64');
  if (cdOffset + cdSize > blob.size) throw new ExportError('badZip', 'central directory out of range');

  const view = await readBytes(blob, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let i = 0; i < entryCount; i++) {
    const [entry, next] = readCentralEntry(view, cursor, decoder);
    entries.push(entry);
    cursor = next;
  }
  return entries;
}

/** A followers file this big is not a real export and would only exhaust memory. */
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;

function assertReadable(entry: ZipEntry): void {
  if (entry.flags & FLAG_ENCRYPTED) throw new ExportError('encrypted', entry.name);
  const sizes = [entry.compressedSize, entry.uncompressedSize, entry.localHeaderOffset];
  if (sizes.includes(U32_MAX)) throw new ExportError('zip64', entry.name);
  if (entry.uncompressedSize > MAX_ENTRY_BYTES || entry.compressedSize > MAX_ENTRY_BYTES) {
    throw new ExportError('zip64', `${entry.name} is too large`);
  }
  if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATE) {
    throw new ExportError('unsupportedCompression', `${entry.name} (method ${entry.method})`);
  }
}

async function inflateRaw(data: Blob, name: string): Promise<string> {
  try {
    const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  } catch {
    throw new ExportError('badZip', `cannot inflate ${name}`);
  }
}

/** Decode one entry as UTF-8 text. Sizes come from the central directory. */
export async function readZipEntryText(blob: Blob, entry: ZipEntry): Promise<string> {
  assertReadable(entry);
  const header = await readBytes(blob, entry.localHeaderOffset, entry.localHeaderOffset + LOCAL_HEADER_SIZE);
  if (header.getUint32(0, true) !== SIG_LOCAL) throw new ExportError('badZip', `bad local header for ${entry.name}`);
  // Local name/extra lengths can differ from the central directory, so always use these.
  const dataStart =
    entry.localHeaderOffset + LOCAL_HEADER_SIZE + header.getUint16(26, true) + header.getUint16(28, true);
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > blob.size) throw new ExportError('badZip', `${entry.name} exceeds archive`);
  const data = blob.slice(dataStart, dataEnd);
  return entry.method === METHOD_STORED ? data.text() : inflateRaw(data, entry.name);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

interface ExportSource {
  kind: ExportFileKind;
  path: string;
  text: string;
}

async function sourcesFromZip(file: ExportFile): Promise<ExportSource[]> {
  const entries = await readZipEntries(file.blob);
  const wanted = entries
    .filter(entry => !entry.name.endsWith('/'))
    .map(entry => ({ entry, kind: classifyExportPath(entry.name) }))
    .filter((item): item is { entry: ZipEntry; kind: ExportFileKind } => item.kind !== null);
  // One entry at a time keeps memory to a single inflated file.
  const sources: ExportSource[] = [];
  for (const { entry, kind } of wanted) {
    sources.push({ kind, path: `${file.path}/${entry.name}`, text: await readZipEntryText(file.blob, entry) });
  }
  return sources;
}

async function sourcesFromFile(file: ExportFile): Promise<ExportSource[]> {
  if (isZipFile(file)) return sourcesFromZip(file);
  const kind = classifyExportPath(file.path);
  return kind ? [{ kind, path: file.path, text: await file.blob.text() }] : [];
}

/** Diff the followers and following lists found in the given zips and/or loose files. */
export async function analyzeInstagramExport(files: readonly ExportFile[]): Promise<ExportResult> {
  const sources: ExportSource[] = [];
  for (const file of files) sources.push(...(await sourcesFromFile(file)));
  const followerSources = sources.filter(source => source.kind === 'followers');
  const followingSources = sources.filter(source => source.kind === 'following');
  if (followerSources.length === 0) throw new ExportError('noFollowers');
  if (followingSources.length === 0) throw new ExportError('noFollowing');

  const parseAll = (list: readonly ExportSource[]) => list.flatMap(source => parseExportText(source.text, source.path));
  return computeExportResult(parseAll(followerSources), parseAll(followingSources));
}
