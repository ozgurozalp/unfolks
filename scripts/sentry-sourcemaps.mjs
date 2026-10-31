#!/usr/bin/env node
// Uploads the production source maps in dist/ to Sentry, then deletes them so they
// never reach the store zip. Runs between `turbo build` and the zipper.
//
// Usage:
//   node scripts/sentry-sourcemaps.mjs            upload when credentials are set, otherwise warn
//   node scripts/sentry-sourcemaps.mjs --require  fail when credentials are missing (used by `pnpm release`)
//
// Credentials come from the environment (or a root .env file, which is gitignored):
//   SENTRY_AUTH_TOKEN  required to upload (an organization token with release access)
//   SENTRY_ORG         optional, defaults to the Unfolks organization
//   SENTRY_PROJECT     optional, defaults to the Unfolks project
//   SENTRY_URL         optional, e.g. https://de.sentry.io when using a personal token

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const SENTRY_CLI = resolve(ROOT, 'node_modules/.bin/sentry-cli');

// From the DSN in packages/shared/lib/utils/sentry.ts. IDs, not secrets.
const DEFAULT_ORG = '4508474214514689';
const DEFAULT_PROJECT = '4508474223427664';

class SourceMapError extends Error {}

function loadDotEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
}

function findSourceMaps(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findSourceMaps(path);
    return entry.name.endsWith('.map') ? [path] : [];
  });
}

/** Must match `extensionRelease()` in packages/shared/lib/utils/sentry.ts. */
function readRelease() {
  const manifestPath = resolve(DIST, 'manifest.json');
  if (!existsSync(manifestPath)) throw new SourceMapError(`${manifestPath} not found. Run \`pnpm build\` first.`);
  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!version) throw new SourceMapError('dist/manifest.json has no version.');
  return `unfolks@${version}`;
}

function runSentryCli(args) {
  const env = {
    ...process.env,
    SENTRY_ORG: process.env.SENTRY_ORG?.trim() || DEFAULT_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT?.trim() || DEFAULT_PROJECT,
  };
  try {
    execFileSync(SENTRY_CLI, args, { cwd: ROOT, env, stdio: 'inherit' });
  } catch {
    throw new SourceMapError(`sentry-cli ${args.slice(0, 2).join(' ')} failed (see output above).`);
  }
}

function removeSourceMaps(maps) {
  for (const map of maps) rmSync(map);
  console.log(`Removed ${maps.length} source map(s) from dist/.`);
}

function main() {
  loadDotEnv();
  const required = process.argv.includes('--require');

  if (!existsSync(DIST)) throw new SourceMapError('dist/ not found. Run `pnpm build` first.');
  const maps = findSourceMaps(DIST);
  if (maps.length === 0) {
    if (required) throw new SourceMapError('No source maps in dist/. Was this a production build?');
    console.warn('No source maps in dist/; nothing to upload.');
    return;
  }

  if (!process.env.SENTRY_AUTH_TOKEN?.trim()) {
    if (required) {
      throw new SourceMapError(
        'SENTRY_AUTH_TOKEN is not set, so Sentry would get no source maps for this release.\n' +
          'Set it in your shell or in a root .env file (see .example.env).',
      );
    }
    console.warn('SENTRY_AUTH_TOKEN is not set: skipping the Sentry source map upload.');
    removeSourceMaps(maps);
    return;
  }

  const release = readRelease();
  // Debug IDs tie each bundle to its map, so stack traces resolve even if the release name differs.
  runSentryCli(['sourcemaps', 'inject', DIST]);
  runSentryCli(['sourcemaps', 'upload', '--release', release, DIST]);
  console.log(`Uploaded ${maps.length} source map(s) to Sentry for ${release}.`);
  removeSourceMaps(maps);
}

try {
  main();
} catch (error) {
  console.error(error instanceof SourceMapError ? error.message : error);
  process.exit(1);
}
