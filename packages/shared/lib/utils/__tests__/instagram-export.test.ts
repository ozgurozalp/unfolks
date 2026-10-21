import { describe, expect, it } from 'vitest';
import {
  analyzeInstagramExport,
  classifyExportPath,
  computeExportResult,
  ExportError,
  parseExportHtml,
  parseExportJson,
  readZipEntries,
  usernameFromHref,
  type ExportErrorCode,
  type ExportFile,
} from '../instagram-export';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface EntryInput {
  value?: string;
  title?: string;
  href?: string;
  timestamp?: number;
}

function igEntry({ value, title = '', href, timestamp }: EntryInput) {
  const item: Record<string, unknown> = {};
  if (href !== undefined) item.href = href;
  if (value !== undefined) item.value = value;
  if (timestamp !== undefined) item.timestamp = timestamp;
  return { title, media_list_data: [], string_list_data: [item] };
}

function user(name: string, timestamp?: number) {
  return igEntry({ value: name, href: `https://www.instagram.com/${name}`, timestamp });
}

function followersJson(...entries: unknown[]): string {
  return JSON.stringify(entries);
}

function followingJson(...entries: unknown[]): string {
  return JSON.stringify({ relationships_following: entries });
}

function textFile(path: string, text: string, type = 'application/json'): ExportFile {
  return { path, blob: new Blob([text], { type }) };
}

// ---------------------------------------------------------------------------
// Tiny ZIP writer for tests (CRC left as 0; the reader doesn't verify it)
// ---------------------------------------------------------------------------

interface ZipSpec {
  name: string;
  data: string;
  method?: 0 | 8;
  flags?: number;
  localExtra?: number;
  centralExtra?: number;
}

const encoder = new TextEncoder();

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function header(size: number, write: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

async function buildZip(specs: readonly ZipSpec[], comment = ''): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const spec of specs) {
    const name = encoder.encode(spec.name);
    const raw = encoder.encode(spec.data);
    const method = spec.method ?? 0;
    const body = method === 8 ? await deflateRaw(raw) : raw;
    const localExtra = spec.localExtra ?? 0;
    const centralExtra = spec.centralExtra ?? 0;
    const flags = (spec.flags ?? 0) | 0x800;

    const local = header(30, v => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, flags, true);
      v.setUint16(8, method, true);
      v.setUint32(18, body.length, true);
      v.setUint32(22, raw.length, true);
      v.setUint16(26, name.length, true);
      v.setUint16(28, localExtra, true);
    });
    const cd = header(46, v => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, flags, true);
      v.setUint16(10, method, true);
      v.setUint32(20, body.length, true);
      v.setUint32(24, raw.length, true);
      v.setUint16(28, name.length, true);
      v.setUint16(30, centralExtra, true);
      v.setUint32(42, offset, true);
    });
    const parts = [local, name, new Uint8Array(localExtra), body];
    chunks.push(...parts);
    central.push(cd, name, new Uint8Array(centralExtra));
    offset += parts.reduce((sum, part) => sum + part.length, 0);
  }

  const cdSize = central.reduce((sum, part) => sum + part.length, 0);
  const commentBytes = encoder.encode(comment);
  const eocd = header(22, v => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, specs.length, true);
    v.setUint16(10, specs.length, true);
    v.setUint32(12, cdSize, true);
    v.setUint32(16, offset, true);
    v.setUint16(20, commentBytes.length, true);
  });
  return new Uint8Array(await new Blob([...chunks, ...central, eocd, commentBytes]).arrayBuffer());
}

function zipFile(bytes: Uint8Array, path = 'instagram-export.zip'): ExportFile {
  return { path, blob: new Blob([bytes], { type: 'application/zip' }) };
}

async function expectExportError(promise: Promise<unknown>, code: ExportErrorCode): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ExportError);
  await expect(promise).rejects.toMatchObject({ code });
}

const DIR = 'connections/followers_and_following/';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('classifyExportPath', () => {
  it('recognises followers and following files in any folder', () => {
    expect(classifyExportPath(`${DIR}followers_1.json`)).toBe('followers');
    expect(classifyExportPath('followers_and_following/followers.html')).toBe('followers');
    expect(classifyExportPath('C:\\Downloads\\Following.JSON')).toBe('following');
    expect(classifyExportPath('following (1).json')).toBe('following');
  });

  it('ignores the other files in the same folder', () => {
    const others = [
      'close_friends.json',
      'recently_unfollowed_profiles.json',
      'pending_follow_requests.json',
      'recent_follow_requests.json',
      'removed_suggestions.json',
      'blocked_profiles.json',
      'restricted_profiles.json',
      "follow_requests_you've_received.json",
      'hide_story_from.json',
      'following_hashtags.json',
      'followers_1.json.bak',
    ];
    for (const name of others) expect(classifyExportPath(`${DIR}${name}`)).toBeNull();
  });
});

describe('usernameFromHref', () => {
  it('reads plain and _u/ profile links', () => {
    expect(usernameFromHref('https://www.instagram.com/Some.User')).toBe('some.user');
    expect(usernameFromHref('https://www.instagram.com/_u/other_user')).toBe('other_user');
    expect(usernameFromHref('https://instagram.com/third/?hl=en')).toBe('third');
  });

  it('rejects reserved segments and foreign hosts', () => {
    expect(usernameFromHref('https://www.instagram.com/explore/tags/x')).toBeUndefined();
    expect(usernameFromHref('https://www.instagram.com/p/abc123')).toBeUndefined();
    expect(usernameFromHref('https://example.com/someone')).toBeUndefined();
  });
});

describe('parseExportJson', () => {
  it('parses a bare followers array and converts seconds to ms', () => {
    // Arrange
    const text = followersJson(user('alice', 1700000000), user('Bob'));

    // Act
    const accounts = parseExportJson(text);

    // Assert
    expect(accounts).toEqual([{ username: 'alice', followedAt: 1700000000000 }, { username: 'bob' }]);
  });

  it('unwraps relationships_followers', () => {
    const text = JSON.stringify({ relationships_followers: [user('carol', 1)] });
    expect(parseExportJson(text)).toEqual([{ username: 'carol', followedAt: 1000 }]);
  });

  it('reads title-only and _u/ href entries from relationships_following', () => {
    const text = followingJson(
      igEntry({ title: 'dave', href: 'https://www.instagram.com/_u/dave', timestamp: 5 }),
      igEntry({ href: 'https://www.instagram.com/_u/erin', timestamp: 6 }),
    );
    expect(parseExportJson(text)).toEqual([
      { username: 'dave', followedAt: 5000 },
      { username: 'erin', followedAt: 6000 },
    ]);
  });

  it('drops invalid and reserved usernames', () => {
    const text = followersJson(
      user('ok_name'),
      igEntry({ value: 'has space' }),
      igEntry({ value: 'x'.repeat(31) }),
      igEntry({ href: 'https://www.instagram.com/explore' }),
      igEntry({ value: 'reels' }),
      { title: 'no-list' },
      'not-an-object',
    );
    expect(parseExportJson(text)).toEqual([{ username: 'ok_name' }]);
  });

  it('throws a parse error on malformed JSON or an unknown shape', () => {
    expect(() => parseExportJson('{oops')).toThrow(ExportError);
    expect(() => parseExportJson('{"something_else": []}')).toThrowError(
      expect.objectContaining({ code: 'parse' }) as Error,
    );
  });
});

describe('parseExportHtml', () => {
  it('extracts usernames from instagram.com profile links', () => {
    const html = `
      <html><body>
        <div><a target="_blank" href="https://www.instagram.com/frank">frank</a><div>Jan 01, 2024 10:00 am</div></div>
        <div><a target="_blank" href="https://www.instagram.com/_u/Grace">grace</a></div>
        <a href='https://www.instagram.com/accounts/login'>login</a>
        <a href="https://help.instagram.com/123">help</a>
      </body></html>`;
    expect(parseExportHtml(html)).toEqual([{ username: 'frank' }, { username: 'grace' }]);
  });
});

describe('computeExportResult', () => {
  it('sorts dated accounts newest first, then undated A–Z', () => {
    const result = computeExportResult(
      [{ username: 'mutual' }],
      [
        { username: 'zed' },
        { username: 'old', followedAt: 1000 },
        { username: 'mutual', followedAt: 5000 },
        { username: 'new', followedAt: 3000 },
        { username: 'amy' },
      ],
    );
    expect(result).toEqual({
      followersCount: 1,
      followingCount: 5,
      nonFollowers: [
        { username: 'new', followedAt: 3000 },
        { username: 'old', followedAt: 1000 },
        { username: 'amy' },
        { username: 'zed' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// analyzeInstagramExport
// ---------------------------------------------------------------------------

describe('analyzeInstagramExport with loose files', () => {
  it('dedupes split follower files and ignores excluded files', async () => {
    // Arrange
    const files = [
      textFile(`${DIR}followers_1.json`, followersJson(user('alice'), user('bob'))),
      textFile(`${DIR}followers_2.json`, followersJson(user('bob'), user('carol'))),
      textFile(`${DIR}close_friends.json`, JSON.stringify({ relationships_close_friends: [user('dave')] })),
      textFile(`${DIR}recently_unfollowed_profiles.json`, followingJson(user('erin'))),
      textFile(`${DIR}pending_follow_requests.json`, followingJson(user('frank'))),
      textFile(
        `${DIR}following.json`,
        followingJson(user('alice', 100), user('ghost', 200), user('older', 50), user('undated')),
      ),
    ];

    // Act
    const result = await analyzeInstagramExport(files);

    // Assert
    expect(result.followersCount).toBe(3);
    expect(result.followingCount).toBe(4);
    expect(result.nonFollowers).toEqual([
      { username: 'ghost', followedAt: 200000 },
      { username: 'older', followedAt: 50000 },
      { username: 'undated' },
    ]);
  });

  it('handles the HTML export', async () => {
    const link = (name: string) => `<a target="_blank" href="https://www.instagram.com/${name}">${name}</a>`;
    const files = [
      textFile('followers_1.html', `<div>${link('alice')}</div>`, 'text/html'),
      textFile('following.html', `<div>${link('alice')}${link('bob')}</div>`, 'text/html'),
    ];
    const result = await analyzeInstagramExport(files);
    expect(result.nonFollowers).toEqual([{ username: 'bob' }]);
  });

  it('throws noFollowing / noFollowers when a list is missing', async () => {
    await expectExportError(
      analyzeInstagramExport([textFile('followers_1.json', followersJson(user('a')))]),
      'noFollowing',
    );
    await expectExportError(
      analyzeInstagramExport([textFile('following.json', followingJson(user('a')))]),
      'noFollowers',
    );
  });

  it('throws parse when a matched file is not valid JSON', async () => {
    const files = [textFile('followers_1.json', 'not json'), textFile('following.json', followingJson())];
    await expectExportError(analyzeInstagramExport(files), 'parse');
  });
});

describe('analyzeInstagramExport with zip archives', () => {
  it('reads stored and deflated entries under connections/followers_and_following/', async () => {
    // Arrange
    const zip = await buildZip([
      { name: 'media/posts/photo.jpg', data: 'binary-ish' },
      { name: DIR, data: '' },
      { name: `${DIR}followers_1.json`, data: followersJson(user('alice'), user('bob')), method: 0 },
      { name: `${DIR}followers_2.json`, data: followersJson(user('carol')), method: 8 },
      { name: `${DIR}close_friends.json`, data: followersJson(user('zoe')), method: 8 },
      {
        name: `${DIR}following.json`,
        data: followingJson(user('alice', 10), user('dan', 20), user('zoe', 30)),
        method: 8,
      },
    ]);

    // Act
    const result = await analyzeInstagramExport([zipFile(zip)]);

    // Assert
    expect(result).toEqual({
      followersCount: 3,
      followingCount: 3,
      nonFollowers: [
        { username: 'zoe', followedAt: 30000 },
        { username: 'dan', followedAt: 20000 },
      ],
    });
  });

  it('uses the local header lengths when its extra field is longer than the central one', async () => {
    const zip = await buildZip(
      [
        { name: 'followers_and_following/followers.json', data: followersJson(user('a')), localExtra: 28 },
        {
          name: 'followers_and_following/following.json',
          data: followingJson(user('a'), user('b')),
          localExtra: 9,
          method: 8,
        },
      ],
      'archive comment',
    );
    const result = await analyzeInstagramExport([zipFile(zip)]);
    expect(result.nonFollowers).toEqual([{ username: 'b' }]);
  });

  it('combines a zip with loose files and detects zips by MIME type', async () => {
    const zip = await buildZip([{ name: `${DIR}followers_1.json`, data: followersJson(user('a')) }]);
    const files: ExportFile[] = [
      { path: 'download', blob: new Blob([zip], { type: 'application/x-zip-compressed' }) },
      textFile('following.json', followingJson(user('a'), user('c'))),
    ];
    const result = await analyzeInstagramExport(files);
    expect(result.nonFollowers).toEqual([{ username: 'c' }]);
  });

  it('lists central directory entries', async () => {
    const zip = await buildZip([{ name: 'a.txt', data: 'hello', method: 8 }]);
    const entries = await readZipEntries(new Blob([zip]));
    expect(entries).toEqual([expect.objectContaining({ name: 'a.txt', method: 8, uncompressedSize: 5 })]);
  });
});

describe('zip errors', () => {
  it('rejects a .zip that is not a zip as notZip', async () => {
    await expectExportError(analyzeInstagramExport([textFile('export.zip', 'definitely not a zip')]), 'notZip');
  });

  it('rejects a truncated zip as badZip', async () => {
    const zip = await buildZip([{ name: 'followers_1.json', data: followersJson(user('a')) }]);
    await expectExportError(analyzeInstagramExport([zipFile(zip.slice(0, zip.length - 30))]), 'badZip');
  });

  it('rejects encrypted entries', async () => {
    const zip = await buildZip([
      { name: 'followers_1.json', data: followersJson(user('a')), flags: 0x1 },
      { name: 'following.json', data: followingJson(user('a')) },
    ]);
    await expectExportError(analyzeInstagramExport([zipFile(zip)]), 'encrypted');
  });

  it('rejects unsupported compression methods', async () => {
    const zip = await buildZip([{ name: 'followers_1.json', data: 'x' }]);
    // Patch the central directory method field (central header starts right after the local entry).
    const cdStart = 30 + 'followers_1.json'.length + 1;
    new DataView(zip.buffer).setUint16(cdStart + 10, 12, true);
    await expectExportError(analyzeInstagramExport([zipFile(zip)]), 'unsupportedCompression');
  });

  it('rejects zip64 archives', async () => {
    const zip = await buildZip([{ name: 'followers_1.json', data: 'x' }]);
    new DataView(zip.buffer).setUint32(zip.length - 22 + 16, 0xffffffff, true);
    await expectExportError(analyzeInstagramExport([zipFile(zip)]), 'zip64');
  });

  it('rejects corrupt deflate data as badZip', async () => {
    const zip = await buildZip([
      { name: 'followers_1.json', data: followersJson(user('a')), method: 0 },
      { name: 'following.json', data: followingJson(user('a')), method: 0 },
    ]);
    // Claim the first (stored, plain JSON) entry is deflated so inflating it fails.
    const cdStart = zip.length - 22 - (46 + 'followers_1.json'.length) - (46 + 'following.json'.length);
    new DataView(zip.buffer).setUint16(cdStart + 10, 8, true);
    await expectExportError(analyzeInstagramExport([zipFile(zip)]), 'badZip');
  });
});
