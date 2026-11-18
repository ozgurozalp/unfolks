import { TYPES, type Request } from '@extension/shared';

/** Under Chrome's 30 s idle limit for extension service workers. */
const KEEPALIVE_MS = 20_000;
const RECONNECT_DELAY_MS = 500;

/**
 * A port to the background that survives the service worker stopping.
 *
 * Chrome stops an idle worker after 30 s even while a port is open, and that
 * closes the port. Without a reconnect, every answer from the Instagram tab
 * after that (a batch's long rest is enough) would be lost: unfollowed
 * accounts would keep their spinner and stay in the list. The ping keeps the
 * worker up; the reconnect covers the times Chrome stops it anyway, and the
 * background then hands over what it buffered meanwhile.
 *
 * Returns a function that closes the port for good.
 */
export default function connectToBackground(onMessage: (request: Request) => void): () => void {
  let port: chrome.runtime.Port | null = null;
  let closed = false;
  let reconnectTimer: number | undefined;

  const connect = () => {
    if (closed) return;
    try {
      port = chrome.runtime.connect();
    } catch (error) {
      // The extension was reloaded or updated; this page can no longer reach it.
      console.error('Background connection failed', error);
      return;
    }
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      if (closed) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
    });
  };

  connect();

  const keepAlive = window.setInterval(() => {
    try {
      port?.postMessage({ type: TYPES.KEEPALIVE });
    } catch {
      // A port that died between the interval ticks reconnects through onDisconnect.
    }
  }, KEEPALIVE_MS);

  return () => {
    closed = true;
    window.clearInterval(keepAlive);
    window.clearTimeout(reconnectTimer);
    port?.onMessage.removeListener(onMessage);
    port?.disconnect();
    port = null;
  };
}
