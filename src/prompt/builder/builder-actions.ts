// src/prompt/builder/builder-actions.ts
export const BuilderActions = {
  Save: 'save',
  Close: 'close',
  Delete: 'delete',
  Duplicate: 'duplicate',
  Diff: 'diff',
  Restore: 'restore',
  Improve: 'improve',
  Standalone: 'standalone',
} as const;

export type BuilderAction = (typeof BuilderActions)[keyof typeof BuilderActions];
