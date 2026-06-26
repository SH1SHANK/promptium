const KEY = 'promptium_retrieval_feedback';
let weights: Record<string, number> = {};
let initialized = false;
export async function initRetrievalFeedback(): Promise<void> {
  if (!initialized) {
    const stored = await chrome.storage.local.get(KEY);
    weights = (stored[KEY] || {}) as Record<string, number>;
    initialized = true;
  }
}
export async function getUsageWeight(id: string): Promise<number> {
  await initRetrievalFeedback();
  return weights[id] || 0;
}
export async function adjustUsageWeight(id: string, delta: number): Promise<void> {
  await initRetrievalFeedback();
  weights[id] = Math.max(-0.2, Math.min(0.2, (weights[id] || 0) + delta));
  await chrome.storage.local.set({ [KEY]: weights });
}
export async function pruneFeedback(ids: Set<string>): Promise<void> {
  await initRetrievalFeedback();
  let changed = false;
  Object.keys(weights).forEach((id) => {
    if (!ids.has(id)) {
      delete weights[id];
      changed = true;
    }
  });
  if (changed) await chrome.storage.local.set({ [KEY]: weights });
}
