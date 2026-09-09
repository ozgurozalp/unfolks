let popupPort: chrome.runtime.Port | null = null;

// Messages that arrive before the popup's port is connected would otherwise be
// dropped, causing e.g. the viewer's name/avatar to be missing on first open
// (a connect/message race). We keep the latest message per type and flush it
// once the port connects. PROGRESS is excluded so a scan running while the
// popup is closed can't flood the buffer.
const bufferedByType = new Map<string, unknown>();

chrome.runtime.onConnect.addListener(port => {
  popupPort = port;

  if (bufferedByType.size) {
    for (const message of bufferedByType.values()) port.postMessage(message);
    bufferedByType.clear();
  }

  port.onDisconnect.addListener(() => {
    popupPort = null;
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  sendResponse({ reply: 'ok' });

  if (popupPort) {
    popupPort.postMessage(message);
    return;
  }

  const type = (message as { type?: string } | undefined)?.type;
  if (type && type !== 'PROGRESS') {
    bufferedByType.set(type, message);
  }
});
