// src/prompt/library/library-actions.ts
export const LibraryActions = {
  Use: 'use',
  Copy: 'copy',
  CopyCompiled: 'copy-compiled',
  Edit: 'edit',
  Duplicate: 'duplicate',
  Delete: 'delete',
  Pin: 'pin',
  Favorite: 'favorite',
  CloseDetails: 'close-details',
} as const;

export type LibraryAction = (typeof LibraryActions)[keyof typeof LibraryActions];
