import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkError } from '../network-error';
import { buildErrorReport } from '../sentry-report';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildErrorReport', () => {
  it('drops a cancelled request', () => {
    expect(buildErrorReport(new DOMException('aborted', 'AbortError'))).toBeNull();
  });

  it('drops a request that failed while offline', () => {
    const error = new NetworkError('following', new TypeError('Failed to fetch'), false);
    expect(buildErrorReport(error)).toBeNull();
  });

  it('reports a failed request as a warning grouped by endpoint', () => {
    const error = new NetworkError('following', new TypeError('Failed to fetch'), true);

    expect(buildErrorReport(error)).toEqual({
      level: 'warning',
      tags: { kind: 'network', endpoint: 'following' },
      fingerprint: ['network-error', 'following'],
    });
  });

  it('treats a bare "Failed to fetch" as a network warning', () => {
    vi.stubGlobal('navigator', { onLine: true });

    expect(buildErrorReport(new TypeError('Failed to fetch'))).toEqual({
      level: 'warning',
      tags: { kind: 'network', endpoint: 'unknown' },
      fingerprint: ['network-error'],
    });
  });

  it('drops a bare "Failed to fetch" while offline', () => {
    vi.stubGlobal('navigator', { onLine: false });

    expect(buildErrorReport(new TypeError('Failed to fetch'))).toBeNull();
  });

  it('reports any other error as an error', () => {
    expect(buildErrorReport(new Error('boom'))).toEqual({ level: 'error', tags: {} });
  });
});
