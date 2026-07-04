// src/prompt/library/library-dom.ts

const getLibraryRoot = () => document.querySelector('.library') as HTMLElement;
const getDetailsRoot = () => document.querySelector('.library-details') as HTMLElement;

export const LibraryDOM = {
  get root() {
    return getLibraryRoot();
  },
  get list() {
    return getLibraryRoot().querySelector('.library-list') as HTMLUListElement;
  },
  get details() {
    return getDetailsRoot();
  },

  // Details panel fields
  get title() {
    return getDetailsRoot().querySelector('.details-title') as HTMLElement;
  },
  get category() {
    return getDetailsRoot().querySelector('.details-category') as HTMLElement;
  },
  get updated() {
    return getDetailsRoot().querySelector('.details-updated') as HTMLElement;
  },
  get desc() {
    return getDetailsRoot().querySelector('.details-desc') as HTMLElement;
  },
  get tags() {
    return getDetailsRoot().querySelector('.details-tags') as HTMLElement;
  },
  get previewBox() {
    return getDetailsRoot().querySelector('.details-preview-box') as HTMLElement;
  },
  get varsSection() {
    return getDetailsRoot().querySelector('.details-vars-section') as HTMLElement;
  },
  get varsInputs() {
    return getDetailsRoot().querySelector('.details-vars-inputs') as HTMLElement;
  },
  get versionList() {
    return getDetailsRoot().querySelector('.library-version-list') as HTMLUListElement;
  },
  get closeBtn() {
    return getDetailsRoot().querySelector('[data-action="close-details"]') as HTMLButtonElement;
  },

  // Action buttons
  get useBtn() {
    return getDetailsRoot().querySelector('[data-action="use"]') as HTMLButtonElement;
  },
  get copyBtn() {
    return getDetailsRoot().querySelector('[data-action="copy"]') as HTMLButtonElement;
  },
  get copyCompiledBtn() {
    return getDetailsRoot().querySelector('[data-action="copy-compiled"]') as HTMLButtonElement;
  },
  get editBtn() {
    return getDetailsRoot().querySelector('[data-action="edit"]') as HTMLButtonElement;
  },
  get dupBtn() {
    return getDetailsRoot().querySelector('[data-action="duplicate"]') as HTMLButtonElement;
  },
  get deleteBtn() {
    return getDetailsRoot().querySelector('[data-action="delete"]') as HTMLButtonElement;
  },
} as const;
