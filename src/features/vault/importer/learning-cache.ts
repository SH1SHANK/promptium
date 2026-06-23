import { LearningPreference } from './types';
import { VaultItemType } from '../types';

const PREFS_STORAGE_KEY = 'promptium_importer_preferences';
let preferences: LearningPreference[] = [];
let isCacheInitialized = false;

export async function initLearningCache(): Promise<void> {
  if (isCacheInitialized) return;
  try {
    const res = await chrome.storage.local.get([PREFS_STORAGE_KEY]);
    const stored = res[PREFS_STORAGE_KEY];
    if (Array.isArray(stored)) {
      preferences = stored;
    }
    isCacheInitialized = true;
  } catch (err) {
    console.error('Failed to initialize importer learning cache:', err);
  }
}

export async function addPreference(pref: LearningPreference): Promise<void> {
  await initLearningCache();
  
  // Prevent exact duplicates or redundant rules
  const exists = preferences.some(p => 
    p.titlePattern === pref.titlePattern && 
    p.sourcePattern === pref.sourcePattern && 
    p.preferredType === pref.preferredType
  );
  if (exists) return;

  preferences.push(pref);
  try {
    await chrome.storage.local.set({ [PREFS_STORAGE_KEY]: preferences });
  } catch (err) {
    console.error('Failed to save learning cache preference:', err);
  }
}

export function findPreferredType(title: string, source: string): VaultItemType | null {
  const normTitle = title.toLowerCase();
  const normSource = source.toLowerCase();

  // 1. Check title patterns
  for (const pref of preferences) {
    if (pref.titlePattern && normTitle.includes(pref.titlePattern.toLowerCase())) {
      return pref.preferredType;
    }
  }

  // 2. Check source patterns
  for (const pref of preferences) {
    if (pref.sourcePattern && normSource.includes(pref.sourcePattern.toLowerCase())) {
      return pref.preferredType;
    }
  }

  return null;
}
