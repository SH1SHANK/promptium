/**
 * File: stores/settings-store.ts
 * Purpose: Manage settings, onboarding state, and continuation states in chrome storage.
 */

import { UserSettings } from '../types/settings';

export const SettingsStore = {
  async getSettings(defaults: Partial<UserSettings> = {}): Promise<UserSettings> {
    const key = (window as any).SidepanelState?.KEYS?.SETTINGS_KEY || 'promptiumSettings';
    const snapshot = (await chrome.storage.local.get([key]).catch(() => ({}))) as Record<
      string,
      any
    >;
    return { ...defaults, ...(snapshot?.[key] || {}) } as UserSettings;
  },
  async setSettings(settings: Partial<UserSettings> = {}): Promise<UserSettings> {
    const key = (window as any).SidepanelState?.KEYS?.SETTINGS_KEY || 'promptiumSettings';
    await chrome.storage.local.set({ [key]: settings });
    return settings as UserSettings;
  },
  async setOnboardingComplete(value = true): Promise<void> {
    const key = (window as any).SidepanelState?.KEYS?.ONBOARDING_KEY || 'onboardingComplete';
    await chrome.storage.local.set({ [key]: Boolean(value) });
  },
};

export const ContinuationStore = {
  async set(key: string, value: any): Promise<any> {
    await chrome.storage.local.set({ [key]: value });
    return value;
  },
  async get(key: string): Promise<any> {
    const snapshot = (await chrome.storage.local.get([key]).catch(() => ({}))) as Record<
      string,
      any
    >;
    return snapshot?.[key] || null;
  },
  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove([key]).catch(() => {});
  },
  async setSession(key: string, value: any): Promise<any> {
    await chrome.storage.session.set({ [key]: value });
    return value;
  },
  async getSession(key: string): Promise<any> {
    const snapshot = (await chrome.storage.session.get([key]).catch(() => ({}))) as Record<
      string,
      any
    >;
    return snapshot?.[key] || null;
  },
  async removeSession(key: string): Promise<void> {
    await chrome.storage.session.remove([key]).catch(() => {});
  },
};

if (typeof window !== 'undefined') {
  (window as any).SettingsStore = SettingsStore;
  (window as any).ContinuationStore = ContinuationStore;
}
