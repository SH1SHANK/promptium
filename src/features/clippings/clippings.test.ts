/**
 * File: src/features/clippings/clippings.test.ts
 * Purpose: Automated unit tests for Clippings Store and Search indexing.
 *          Runs under Node.js via tsx.
 */

import { ClippingStore } from './store';
import { Clipping } from './types';

let failed = false;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`✗ Assertion Failed: ${message}`);
    failed = true;
  } else {
    console.log(`✓ Passed: ${message}`);
  }
}

// Mock chrome local storage
const storeMap = new Map<string, any>();
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (keys: string[]) => {
        const res: Record<string, any> = {};
        keys.forEach((key) => {
          res[key] = storeMap.get(key);
        });
        return res;
      },
      set: async (items: Record<string, any>) => {
        Object.entries(items).forEach(([key, val]) => {
          storeMap.set(key, val);
        });
      },
    },
  },
} as any;

// Mock crypto
if (!(globalThis as any).crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => 'uuid-' + Math.random().toString(36).substring(2, 11),
    },
    configurable: true,
    writable: true,
  });
} else if (!(globalThis as any).crypto.randomUUID) {
  Object.defineProperty((globalThis as any).crypto, 'randomUUID', {
    value: () => 'uuid-' + Math.random().toString(36).substring(2, 11),
    configurable: true,
    writable: true,
  });
}

console.log('Running Clippings unit tests...');

void (async () => {
  try {
    // 1. Initial empty load
    const initial = await ClippingStore.load();
    assert(Array.isArray(initial) && initial.length === 0, 'Clippings store initializes empty.');

    // 2. Save clipping
    const clipping1: Clipping = {
      id: 'c1',
      platform: 'chatgpt',
      conversationTitle: 'Supabase Authorization Setup',
      selectedText: 'Use Supabase RLS policies for row level security database authorization.',
      tags: ['supabase', 'security'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const saved1 = await ClippingStore.save(clipping1);
    assert(saved1.id === 'c1', 'Clipping is successfully saved with ID.');

    const all = await ClippingStore.getAll();
    const first = all[0];
    assert(
      all.length === 1 && first !== undefined && first.id === 'c1',
      'getAll retrieves the saved clipping.'
    );

    // 3. Save another clipping
    const clipping2: Clipping = {
      id: 'c2',
      platform: 'claude',
      conversationTitle: 'TypeScript Declarations',
      selectedText:
        'Define window types in window.d.ts to support custom global interface properties.',
      tags: ['typescript', 'types'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await ClippingStore.save(clipping2);
    const all2 = await ClippingStore.getAll();
    assert(all2.length === 2, 'getAll retrieves both saved clippings.');

    // 4. Merge clippings
    const merged = await ClippingStore.merge(['c1', 'c2'], 'Merged notes');
    assert(merged !== null, 'Merge operation succeeds.');
    assert(
      merged !== null &&
        merged.selectedText.includes('Supabase RLS') &&
        merged.selectedText.includes('window.d.ts'),
      'Merged selectedText contains text from both clippings.'
    );
    assert(
      merged !== null && merged.tags.includes('supabase') && merged.tags.includes('typescript'),
      'Merged clipping combines tags from both clippings.'
    );

    // 5. Delete clipping
    if (merged) {
      const deleted = await ClippingStore.delete(merged.id);
      assert(deleted, 'Merged clipping successfully deleted.');
      const all3 = await ClippingStore.getAll();
      // c1 and c2 were removed in merge, and merged was deleted, so count should be 0
      assert(all3.length === 0, 'Clippings list is empty after deleting merged item.');
    }

    // 6. Test search morphology/inflection tolerance
    const searchClipping: Clipping = {
      id: 'search-c',
      platform: 'gemini',
      conversationTitle: 'Authentication Settings',
      selectedText: 'Configuring user sign-in and authentication options.',
      tags: ['auth'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await ClippingStore.save(searchClipping);

    // Search query "authenticate" should match "authentication" via Compromise morphology expansion
    const results = await ClippingStore.search('authenticate');
    const firstResult = results[0];
    assert(
      results.length > 0 && firstResult !== undefined && firstResult.id === 'search-c',
      'Search query "authenticate" matches clipping containing "authentication" via Compromise.'
    );

    if (failed) {
      process.exit(1);
    } else {
      console.log('All Clippings tests passed successfully.');
      process.exit(0);
    }
  } catch (err: any) {
    console.error('Test execution failed with error:', err);
    process.exit(1);
  }
})();
