/**
 * File: stores/bookmark-store.ts
 * Purpose: Provides access to bookmarked chat messages in chrome storage.
 */

export const BookmarkStore = {
  KEY: 'bookmarks',
  async getAll() {
    const snapshot = (await chrome.storage.local.get(['bookmarks']).catch(() => ({}))) as any;
    return snapshot?.bookmarks && typeof snapshot.bookmarks === 'object'
      ? snapshot.bookmarks
      : {};
  },
  async setAll(bookmarks: any = {}) {
    await chrome.storage.local.set({ bookmarks });
    return bookmarks;
  },
};

if (typeof window !== 'undefined') {
  (window as any).BookmarkStore = BookmarkStore;
}
