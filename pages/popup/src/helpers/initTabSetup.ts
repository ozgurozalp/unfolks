import findInstagramTabs from '@src/helpers/findInstagramTabs';
import { useMainStore } from '@src/store';

async function syncInstagramTabs() {
  try {
    const tabIds = await findInstagramTabs();
    useMainStore.setState({ hasInstagramTab: tabIds.length > 0 });
  } catch {
    useMainStore.setState({ hasInstagramTab: false });
  }
}

/**
 * The side panel outlives tab switches, so the availability of an Instagram tab
 * is tracked live instead of being read once at startup.
 */
export default async function initTabSetup() {
  await syncInstagramTabs();

  chrome.tabs.onActivated.addListener(() => void syncInstagramTabs());
  chrome.tabs.onRemoved.addListener(() => void syncInstagramTabs());

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') void syncInstagramTabs();
  });

  chrome.windows?.onFocusChanged.addListener(() => void syncInstagramTabs());
}
