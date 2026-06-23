/**
 * File: types/domain/bookmark.ts
 * Purpose: Centralized domain type for Promptium bookmarks.
 */

export interface Bookmark {
  id: string;
  role: string;
  text: string;
  timestamp?: string;
  bookmarked: boolean;
}

export type BookmarksMap = Record<string, Bookmark>;
