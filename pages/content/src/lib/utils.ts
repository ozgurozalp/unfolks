export async function sendMessageToBackground(message: unknown) {
  return chrome.runtime.sendMessage(message);
}
