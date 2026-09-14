import isInstagram from '@src/helpers/isInstagram';

/**
 * The side panel stays open on any site, so scans run against whichever Instagram
 * tab is open, active or in the background. Candidates are ordered by how likely
 * they are to answer: the active tab first, then the most recently used ones.
 */
export default async function findInstagramTabs(): Promise<number[]> {
  const [tabs, [activeTab]] = await Promise.all([
    chrome.tabs.query({ url: 'https://www.instagram.com/*' }),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);

  return tabs
    .filter(tab => tab.id !== undefined && isInstagram(tab.url ?? ''))
    .sort((a, b) => rank(b, activeTab?.id) - rank(a, activeTab?.id))
    .map(tab => tab.id as number);
}

/** Discarded tabs lost their content script, so they are tried last. */
const rank = (tab: chrome.tabs.Tab, activeTabId?: number) => {
  if (tab.discarded) return -1;
  return tab.id === activeTabId ? Number.MAX_SAFE_INTEGER : (tab.lastAccessed ?? 0);
};
