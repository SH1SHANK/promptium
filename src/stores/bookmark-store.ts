/**
 * File: stores/bookmark-store.ts
 * Purpose: Provides access to bookmarked chat messages in chrome storage.
 */

import { BookmarksMap } from '../types/domain/bookmark';

export const BookmarkStore = {
  KEY: 'bookmarks',
  async getAll(): Promise<BookmarksMap> {
    const snapshot = (await chrome.storage.local.get(['bookmarks']).catch(() => ({}))) as any;
    return snapshot?.bookmarks && typeof snapshot.bookmarks === 'object'
      ? (snapshot.bookmarks as BookmarksMap)
      : {};
  },
  async setAll(bookmarks: BookmarksMap = {}): Promise<BookmarksMap> {
    await chrome.storage.local.set({ bookmarks });
    return bookmarks;
  },
};

if (typeof window !== 'undefined') {
  (window as any).BookmarkStore = BookmarkStore;
}
