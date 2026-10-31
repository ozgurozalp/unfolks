/**
 * A request that never got an HTTP answer: offline, the tab closing, an ad
 * blocker, or Instagram dropping the connection. The browser only says
 * "Failed to fetch", so this keeps which request it was.
 */
export class NetworkError extends Error {
  readonly endpoint: string;
  readonly online: boolean;

  constructor(endpoint: string, cause: unknown, online = isOnline()) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Network request to ${endpoint} failed: ${reason}`, { cause });
    this.name = 'NetworkError';
    this.endpoint = endpoint;
    this.online = online;
  }
}

// What Chrome, Firefox and Safari put on the TypeError when fetch gets no response.
const FETCH_FAILURE_MESSAGES = ['failed to fetch', 'networkerror when attempting to fetch resource', 'load failed'];

export function isFetchFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return FETCH_FAILURE_MESSAGES.some(text => message.includes(text));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** `fetch`, but a request with no answer rejects with a NetworkError that names `endpoint`. */
export async function fetchWithContext(endpoint: string, input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (isFetchFailure(error)) throw new NetworkError(endpoint, error);
    throw error;
  }
}
