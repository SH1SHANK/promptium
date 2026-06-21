/**
 * File: stores/settings-store.ts
 * Purpose: Manage settings, onboarding state, and continuation states in chrome storage.
 */

export const SettingsStore = {
  async getSettings(defaults: any = {}) {
    const key = (window as any).SidepanelState?.KEYS?.SETTINGS_KEY || 'promptiumSettings';
    const snapshot = await chrome.storage.local.get([key]).catch(() => ({}));
    return { ...defaults, ...(snapshot?.[key] || {}) };
  },
  async setSettings(settings: any = {}) {
    const key = (window as any).SidepanelState?.KEYS?.SETTINGS_KEY || 'promptiumSettings';
    await chrome.storage.local.set({ [key]: settings });
    return settings;
  },
  async setOnboardingComplete(value = true) {
    const key = (window as any).SidepanelState?.KEYS?.ONBOARDING_KEY || 'onboardingComplete';
    await chrome.storage.local.set({ [key]: Boolean(value) });
  },
};

export const ContinuationStore = {
  async set(key: string, value: any) {
    await chrome.storage.local.set({ [key]: value });
    return value;
  },
  async get(key: string) {
    const snapshot = await chrome.storage.local.get([key]).catch(() => ({}));
    return snapshot?.[key] || null;
  },
  async remove(key: string) {
    await chrome.storage.local.remove([key]).catch(() => {});
  },
  async setSession(key: string, value: any) {
    await chrome.storage.session.set({ [key]: value });
    return value;
  },
  async getSession(key: string) {
    const snapshot = await chrome.storage.session.get([key]).catch(() => ({}));
    return snapshot?.[key] || null;
  },
  async removeSession(key: string) {
    await chrome.storage.session.remove([key]).catch(() => {});
  },
};

if (typeof window !== 'undefined') {
  (window as any).SettingsStore = SettingsStore;
  (window as any).ContinuationStore = ContinuationStore;
}
