import findInstagramTabs from '@src/helpers/findInstagramTabs';

export default async function sendMessage(message: any) {
  const tabIds = await findInstagramTabs();
  // Tabs opened before the extension was installed have no content script, so
  // every candidate is tried before giving up.
  let lastError: unknown = new Error('Instagram tab not found');

  for (const tabId of tabIds) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
