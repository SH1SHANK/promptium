import { generateContinuationHandoff } from './handoff-builder';

export const injectContinuationContext = async (
  platform: string,
  targetPlatform: string
): Promise<boolean> => {
  try {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = activeTabs[0]?.id;
    if (!tabId) return false;

    // 1. Scrape source messages
    const response = await chrome.tabs
      .sendMessage(tabId, { action: 'scrapeForContinuation' })
      .catch(() => null);
    if (!response?.ok || !Array.isArray(response.messages)) {
      return false;
    }

    // 2. Generate handoff
    const handoffResult = await generateContinuationHandoff(response.messages);
    if (!handoffResult.ok || !handoffResult.text) {
      return false;
    }

    // 3. Store handoff text
    const CONTINUATION_KEY = 'pendingContinuation';
    await chrome.storage.local.set({
      [CONTINUATION_KEY]: {
        text: handoffResult.text,
        sourcePlatform: platform,
        targetPlatform,
        createdAt: Date.now(),
      },
    });

    // 4. Locate target tab or open a new one
    const targetUrl = window.Bridge?.LLM_URLS?.[targetPlatform];
    if (!targetUrl) return false;

    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find((t) =>
      String(t.url || '')
        .toLowerCase()
        .includes(targetPlatform)
    );

    if (existingTab?.id) {
      await chrome.tabs.update(existingTab.id, { active: true });
      // Inject instantly since tab is already loaded
      await chrome.tabs
        .sendMessage(existingTab.id, { action: 'hydratePendingContinuation' })
        .catch(() => {});
    } else {
      await chrome.tabs.create({ url: targetUrl });
    }

    return true;
  } catch (error) {
    console.error('[Promptium][Continuation] Direct handoff redirection failed.', error);
    return false;
  }
};
