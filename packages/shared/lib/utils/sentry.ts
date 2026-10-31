import { BrowserClient, defaultStackParser, getDefaultIntegrations, makeFetchTransport, Scope } from '@sentry/browser';
import { buildErrorReport } from './sentry-report';

const integrations = getDefaultIntegrations({}).filter(defaultIntegration => {
  return !['BrowserApiErrors', 'Breadcrumbs', 'GlobalHandlers'].includes(defaultIntegration.name);
});

/** Must match the release the source maps are uploaded under (scripts/sentry-sourcemaps.mjs). */
function extensionRelease(): string | undefined {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getManifest) return undefined;
  return `unfolks@${chrome.runtime.getManifest().version}`;
}

export const sentryClient = new BrowserClient({
  dsn: 'https://d9c194b14eed5aa9c8278dd7316cb969@o4508474214514689.ingest.de.sentry.io/4508474223427664',
  release: extensionRelease(),
  transport: makeFetchTransport,
  stackParser: defaultStackParser,
  integrations: integrations,
});

const scope = new Scope();
scope.setClient(sentryClient);

/**
 * Send an error to Sentry. Cancelled and offline requests are skipped; `extra`
 * carries what the error message alone does not say, like where a scan stopped.
 */
export function captureException(error: Error, extra?: Record<string, unknown>) {
  const report = buildErrorReport(error);
  if (!report) return;

  scope.captureException(error, {
    captureContext: {
      level: report.level,
      tags: report.tags,
      extra,
      fingerprint: report.fingerprint,
    },
  });
}
