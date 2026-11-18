const BUFFER_STORAGE_KEY = 'bufferedByType';

// Chrome has no `default_popup`, so the toolbar icon has to be wired to the
// side panel explicitly. Firefox keeps the popup and has no sidePanel API.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// One side panel can be open per window, so several may be connected at once.
// Port objects cannot be serialized; this set is only valid while the worker
// is alive. An idle port does not keep the worker alive (Chrome 114+), so the
// panel pings over it and reconnects when Chrome stops the worker anyway.
const ports = new Set<chrome.runtime.Port>();

// Latest message per type (per account for unfollow answers), flushed when a port connects. PROGRESS is excluded
// because the scan lives in the Instagram tab and the panel asks for the
// current state when it reopens. Buffering every tick would go stale.
// chrome.storage.session survives worker restarts; the in-memory copy and
// write queue keep connect/message races from dropping or duplicating items.
let memoryBuffer: Record<string, unknown> = {};
let bufferLoaded = false;
let bufferQueue: Promise<void> = Promise.resolve();

function canUseSessionStorage() {
  return Boolean(chrome.storage?.session);
}

function enqueueBufferTask(task: () => Promise<void>) {
  bufferQueue = bufferQueue.then(task).catch(error => {
    console.error('Message buffer task failed', error);
  });
  return bufferQueue;
}

async function loadBuffer() {
  if (bufferLoaded) return;
  if (canUseSessionStorage()) {
    try {
      const result = await chrome.storage.session.get(BUFFER_STORAGE_KEY);
      const stored = result[BUFFER_STORAGE_KEY] as Record<string, unknown> | undefined;
      memoryBuffer = { ...(stored ?? {}), ...memoryBuffer };
    } catch (error) {
      console.error('Failed to read message buffer', error);
    }
  }
  bufferLoaded = true;
}

async function persistBuffer() {
  if (!canUseSessionStorage()) return;
  try {
    if (Object.keys(memoryBuffer).length === 0) {
      await chrome.storage.session.remove(BUFFER_STORAGE_KEY);
      return;
    }
    await chrome.storage.session.set({ [BUFFER_STORAGE_KEY]: memoryBuffer });
  } catch (error) {
    console.error('Failed to persist message buffer', error);
  }
}

/**
 * Where a message waits in the buffer. Answers about one account (unfollowed,
 * failed, blocked) each keep their own slot: in a batch, the newest one must
 * not overwrite the others, or those accounts keep their spinner and stay in
 * the list after they were unfollowed.
 */
function bufferKeyOf(message: unknown): string | null {
  const { type, deletedId } = (message as { type?: string; deletedId?: string } | undefined) ?? {};
  if (!type || type === 'PROGRESS' || type === 'KEEPALIVE') return null;
  return deletedId ? `${type}:${deletedId}` : type;
}

async function bufferMessage(message: unknown) {
  const key = bufferKeyOf(message);
  if (!key) return;

  await loadBuffer();
  memoryBuffer[key] = message;
  await persistBuffer();
}

async function flushBufferTo(port: chrome.runtime.Port) {
  await loadBuffer();
  const remaining: Record<string, unknown> = {};

  for (const [key, message] of Object.entries(memoryBuffer)) {
    try {
      // Tells the panel this arrived while it was closed, so it can say so.
      port.postMessage({ ...(message as object), deliveredLate: true });
    } catch (error) {
      console.error('Failed to flush buffered message', error);
      remaining[key] = message;
    }
  }

  memoryBuffer = remaining;
  await persistBuffer();
}

chrome.runtime.onConnect.addListener(port => {
  ports.add(port);
  void enqueueBufferTask(() => flushBufferTo(port));

  // The panel's KEEPALIVE pings land here; receiving them is what keeps the worker up.
  port.onMessage.addListener(() => {});

  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  sendResponse({ reply: 'ok' });

  let delivered = false;
  for (const port of ports) {
    try {
      port.postMessage(message);
      delivered = true;
    } catch {
      // The panel closed before onDisconnect fired.
      ports.delete(port);
    }
  }
  if (delivered) return;

  void enqueueBufferTask(() => bufferMessage(message));
});
