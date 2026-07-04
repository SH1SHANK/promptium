// src/prompt/builder/builder-dom.ts

const getRoot = () => document.querySelector('.builder') as HTMLElement;

export const BuilderDOM = {
  get root() {
    return getRoot();
  },
  get toolbar() {
    return getRoot().querySelector('.builder-toolbar') as HTMLElement;
  },
  get metadata() {
    return getRoot().querySelector('.builder-metadata') as HTMLElement;
  },
  get editor() {
    return getRoot().querySelector('.builder-editor') as HTMLElement;
  },
  get editorBackdrop() {
    return getRoot().querySelector('.builder-editor-backdrop') as HTMLElement;
  },
  get workspace() {
    return getRoot().querySelector('.builder-workspace') as HTMLElement;
  },
  get status() {
    return getRoot().querySelector('.builder-status') as HTMLElement;
  },

  // Metadata fields
  get titleInput() {
    return getRoot().querySelector('#builder-title') as HTMLInputElement;
  },
  get descInput() {
    return getRoot().querySelector('#builder-description') as HTMLInputElement;
  },
  get categorySelect() {
    return getRoot().querySelector('#builder-category') as HTMLSelectElement;
  },
  get textarea() {
    return getRoot().querySelector('#builder-text') as HTMLTextAreaElement;
  },
  get tagsContainer() {
    return getRoot().querySelector('#builder-tags-container') as HTMLElement;
  },
  get tagsHidden() {
    return getRoot().querySelector('#builder-tags-hidden') as HTMLInputElement;
  },
  get tagsInput() {
    return getRoot().querySelector('#builder-tags-input') as HTMLInputElement;
  },
  get favoriteInput() {
    return getRoot().querySelector('#builder-favorite') as HTMLInputElement;
  },
  get pinnedInput() {
    return getRoot().querySelector('#builder-pinned') as HTMLInputElement;
  },

  // Workspace panes
  get variableList() {
    return getRoot().querySelector('.builder-variable-list') as HTMLUListElement;
  },
  get diagnostics() {
    return getRoot().querySelector('.diagnostics-container') as HTMLElement;
  },
  get previewBox() {
    return getRoot().querySelector('.builder-preview--rendered') as HTMLElement;
  },
  get rawBox() {
    return getRoot().querySelector('.builder-preview--raw') as HTMLElement;
  },
  get versionList() {
    return getRoot().querySelector('.builder-version-list') as HTMLUListElement;
  },
  get diffContainer() {
    return getRoot().querySelector('.diff-container') as HTMLElement;
  },
  get diffBox() {
    return getRoot().querySelector('.diff-box') as HTMLElement;
  },
  get closeDiffBtn() {
    return getRoot().querySelector('#builder-close-diff-btn') as HTMLButtonElement;
  },

  // Status bar
  get statsBar() {
    return getRoot().querySelector('.builder-stats-bar') as HTMLElement;
  },
  get healthScore() {
    return getRoot().querySelector('.health-score-pill') as HTMLElement;
  },

  // Dialogs and buttons
  get promptBuilder() {
    return document.getElementById('prompt-builder') as HTMLDialogElement;
  },
  get unsavedDialog() {
    return document.getElementById('prompt-unsaved-dialog') as HTMLElement;
  },
  get modePlain() {
    return getRoot().querySelector('#builder-mode-plain') as HTMLButtonElement;
  },
  get modeTemplate() {
    return getRoot().querySelector('#builder-mode-template') as HTMLButtonElement;
  },
  get suggestTitleBtn() {
    return getRoot().querySelector('#builder-suggest-title-btn') as HTMLButtonElement;
  },
  get duplicateBanner() {
    return getRoot().querySelector('.builder-duplicate-banner') as HTMLElement;
  },
  get categoriesPane() {
    return getRoot().querySelector('.builder-categories-pane') as HTMLElement;
  },
  get newCategoryInput() {
    return getRoot().querySelector('.builder-new-category-input') as HTMLInputElement;
  },
  get addCategoryBtn() {
    return getRoot().querySelector('.builder-add-category-btn') as HTMLButtonElement;
  },
  get categoriesList() {
    return getRoot().querySelector('.builder-categories-list') as HTMLUListElement;
  },
  get statusDot() {
    return getRoot().querySelector('.status-dot') as HTMLElement;
  },
  get statusText() {
    return getRoot().querySelector('.status-text') as HTMLElement;
  },
  get categoryManageBtn() {
    return getRoot().querySelector('#builder-category-manage-btn') as HTMLButtonElement;
  },
  get tabDiagnostics() {
    return getRoot().querySelector('#builder-tab-diagnostics') as HTMLElement;
  },
} as const;
