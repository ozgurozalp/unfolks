#!/usr/bin/env node
// Uploads dist-zip/extension.zip to the Chrome Web Store and submits it for review,
// using the Chrome Web Store API v2. No dependencies; needs Node 18+ (global fetch).
//
// Usage:
//   node scripts/chrome-web-store.mjs --check-env   only verify credentials are set
//   node scripts/chrome-web-store.mjs               upload, then submit for review
//   node scripts/chrome-web-store.mjs --upload-only upload a draft, do not submit
//
// Credentials come from the environment (or a root .env file, which is gitignored).
// See "Publishing from the Command Line" in CHROMEWEBSTORE.md.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZIP_PATH = resolve(ROOT, 'dist-zip/extension.zip');
const DEFAULT_EXTENSION_ID = 'idgjpjkoddplmbdepekendpdbaibcgpc';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://chromewebstore.googleapis.com';

const REQUIRED_ENV = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID'];

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

class ReleaseError extends Error {}

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

function readConfig() {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new ReleaseError(
      `Missing Chrome Web Store credentials: ${missing.join(', ')}.\n` +
        'Set them in your shell or in a root .env file. See "Publishing from the Command Line" in CHROMEWEBSTORE.md.',
    );
  }

  return {
    clientId: process.env.CWS_CLIENT_ID.trim(),
    clientSecret: process.env.CWS_CLIENT_SECRET.trim(),
    refreshToken: process.env.CWS_REFRESH_TOKEN.trim(),
    publisherId: process.env.CWS_PUBLISHER_ID.trim(),
    extensionId: process.env.CWS_EXTENSION_ID?.trim() || DEFAULT_EXTENSION_ID,
  };
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function describeApiError(body) {
  return body?.error?.message || body?.error_description || body?.error || body?.raw || JSON.stringify(body);
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await parseJson(response);
  if (!response.ok || !body.access_token) {
    throw new ReleaseError(
      `Could not get an access token (HTTP ${response.status}): ${describeApiError(body)}\n` +
        'Check CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN. Refresh tokens from an OAuth app in ' +
        '"Testing" status expire after 7 days.',
    );
  }
  return body.access_token;
}

async function callApi(accessToken, method, url, { body, contentType } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  });
  const json = await parseJson(response);
  if (!response.ok) {
    throw new ReleaseError(`${method} ${url} failed (HTTP ${response.status}): ${describeApiError(json)}`);
  }
  return json;
}

function itemPath({ publisherId, extensionId }) {
  return `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
}

const isInProgress = state => state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS';

async function waitForUpload(accessToken, config) {
  const url = `${API_BASE}/v2/${itemPath(config)}:fetchStatus`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(done => setTimeout(done, POLL_INTERVAL_MS));
    const status = await callApi(accessToken, 'GET', url);
    const state = status.lastAsyncUploadState;
    console.log(`  upload state: ${state ?? 'unknown'}`);
    if (!isInProgress(state)) return state;
  }
  throw new ReleaseError('Timed out waiting for the Chrome Web Store to process the upload.');
}

async function upload(accessToken, config) {
  if (!existsSync(ZIP_PATH)) {
    throw new ReleaseError(`${ZIP_PATH} not found. Run "pnpm zip" first.`);
  }

  console.log(`Uploading ${ZIP_PATH} to item ${config.extensionId}...`);
  const result = await callApi(accessToken, 'POST', `${API_BASE}/upload/v2/${itemPath(config)}:upload`, {
    body: readFileSync(ZIP_PATH),
    contentType: 'application/zip',
  });

  const state = isInProgress(result.uploadState) ? await waitForUpload(accessToken, config) : result.uploadState;
  if (state !== 'SUCCEEDED') {
    throw new ReleaseError(`Upload did not succeed (state: ${state}). Response: ${JSON.stringify(result)}`);
  }

  const expectedVersion = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
  if (result.crxVersion && result.crxVersion !== expectedVersion) {
    console.warn(
      `Warning: uploaded version ${result.crxVersion} differs from package.json version ${expectedVersion}.`,
    );
  }
  console.log(`Upload succeeded${result.crxVersion ? ` (version ${result.crxVersion})` : ''}.`);
}

async function publish(accessToken, config) {
  console.log('Submitting for review...');
  const result = await callApi(accessToken, 'POST', `${API_BASE}/v2/${itemPath(config)}:publish`, {
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
    contentType: 'application/json',
  });

  if (['REJECTED', 'CANCELLED', 'ITEM_STATE_UNSPECIFIED'].includes(result.state)) {
    throw new ReleaseError(`Submission was not accepted (state: ${result.state}). Response: ${JSON.stringify(result)}`);
  }
  if (result.warningInfo) console.warn('Warnings:', JSON.stringify(result.warningInfo, null, 2));
  console.log(`Submitted. Item state: ${result.state}.`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  loadDotEnv();
  const config = readConfig();

  if (args.has('--check-env')) {
    console.log('Chrome Web Store credentials are set.');
    return;
  }

  const accessToken = await getAccessToken(config);
  await upload(accessToken, config);

  if (args.has('--upload-only')) {
    console.log('Skipping submission (--upload-only). Submit the draft from the developer dashboard.');
    return;
  }
  await publish(accessToken, config);
}

main().catch(error => {
  console.error(error instanceof ReleaseError ? `\n${error.message}` : error);
  process.exit(1);
});
