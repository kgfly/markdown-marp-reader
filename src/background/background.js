/**
 * Opens the reader in a tab and reuses an existing tab when possible.
 * chrome.runtime.getContexts() needs no extra permissions and is available
 * from Chrome 116 (declared as minimum_chrome_version in the manifest).
 */
const VIEWER_URL = chrome.runtime.getURL('viewer.html');

async function openViewer() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['TAB'],
      documentUrls: [VIEWER_URL],
    });
    const existing = contexts.find((context) => context.tabId >= 0);
    if (existing) {
      await chrome.tabs.update(existing.tabId, { active: true });
      if (existing.windowId >= 0) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return;
    }
  } catch {
    // getContexts can be unavailable on older builds; just open a new tab.
  }

  await chrome.tabs.create({ url: VIEWER_URL });
}

chrome.action.onClicked.addListener(() => {
  openViewer().catch((error) => console.error('Failed to open viewer', error));
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({ url: VIEWER_URL }).catch(() => {});
  }
});
