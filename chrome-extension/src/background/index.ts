const BUFFER_STORAGE_KEY = 'bufferedByType';

// Chrome has no `default_popup`, so the toolbar icon has to be wired to the
// side panel explicitly. Firefox keeps the popup and has no sidePanel API.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// One side panel can be open per window, so several may be connected at once.
// Port objects cannot be serialized; this set is only valid while the worker
// is alive, and an open port is what keeps it alive.
const ports = new Set<chrome.runtime.Port>();

// Latest message per type, flushed when a port connects. PROGRESS is excluded
// so a scan running while the popup is closed can't flood the buffer.
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

async function bufferMessage(message: unknown) {
  const type = (message as { type?: string } | undefined)?.type;
  if (!type || type === 'PROGRESS') return;

  await loadBuffer();
  memoryBuffer[type] = message;
  await persistBuffer();
}

async function flushBufferTo(port: chrome.runtime.Port) {
  await loadBuffer();
  const remaining: Record<string, unknown> = {};

  for (const [type, message] of Object.entries(memoryBuffer)) {
    try {
      port.postMessage(message);
    } catch (error) {
      console.error('Failed to flush buffered message', error);
      remaining[type] = message;
    }
  }

  memoryBuffer = remaining;
  await persistBuffer();
}

chrome.runtime.onConnect.addListener(port => {
  ports.add(port);
  void enqueueBufferTask(() => flushBufferTo(port));

  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  sendResponse({ reply: 'ok' });

  if (ports.size) {
    for (const port of ports) port.postMessage(message);
    return;
  }

  void enqueueBufferTask(() => bufferMessage(message));
});
