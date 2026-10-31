import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, fetchWithContext, isAbortError, isFetchFailure } from '../network-error';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isFetchFailure', () => {
  it('recognises the TypeError each browser throws when fetch gets no response', () => {
    expect(isFetchFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isFetchFailure(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isFetchFailure(new TypeError('Load failed'))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isFetchFailure(new TypeError('x is not a function'))).toBe(false);
    expect(isFetchFailure(new Error('Failed to fetch'))).toBe(false);
    expect(isFetchFailure('Failed to fetch')).toBe(false);
  });
});

describe('isAbortError', () => {
  it('matches a cancelled request', () => {
    expect(isAbortError(new DOMException('The user aborted a request.', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('boom'))).toBe(false);
  });
});

describe('fetchWithContext', () => {
  it('returns the response when the request succeeds', async () => {
    const response = new Response('ok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(fetchWithContext('following', '/x')).resolves.toBe(response);
  });

  it('names the endpoint when the request gets no answer', async () => {
    const cause = new TypeError('Failed to fetch');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(cause)),
    );

    const error = await fetchWithContext('following', '/x').catch(e => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.endpoint).toBe('following');
    expect(error.message).toBe('Network request to following failed: Failed to fetch');
    expect(error.cause).toBe(cause);
  });

  it('leaves an aborted request as it is', async () => {
    const abort = new DOMException('The user aborted a request.', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(abort)),
    );

    await expect(fetchWithContext('following', '/x')).rejects.toBe(abort);
  });
});
