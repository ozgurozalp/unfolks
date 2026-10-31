import { NetworkError, isAbortError, isFetchFailure, isOnline } from './network-error';

export type ReportLevel = 'error' | 'warning';

export interface ErrorReport {
  level: ReportLevel;
  tags: Record<string, string>;
  /** Groups the issue in Sentry; undefined keeps Sentry's own grouping. */
  fingerprint?: string[];
}

/**
 * Decide how an error goes to Sentry, or null to drop it.
 * Cancelled requests and requests made while offline are not bugs, so they are dropped.
 * Other requests with no answer are warnings, grouped by the endpoint that failed.
 */
export function buildErrorReport(error: unknown): ErrorReport | null {
  if (isAbortError(error)) return null;

  if (error instanceof NetworkError) {
    if (!error.online) return null;
    return {
      level: 'warning',
      tags: { kind: 'network', endpoint: error.endpoint },
      fingerprint: ['network-error', error.endpoint],
    };
  }

  // A fetch outside fetchWithContext: still a network failure, just without an endpoint.
  if (isFetchFailure(error)) {
    if (!isOnline()) return null;
    return { level: 'warning', tags: { kind: 'network', endpoint: 'unknown' }, fingerprint: ['network-error'] };
  }

  return { level: 'error', tags: {} };
}
