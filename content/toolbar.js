/**
 * File: content/toolbar.js
 * Purpose: Creates and mounts the in-page PromptNest toolbar with action handlers.
 * Communicates with: content/content.js, content/scraper.js, content/injector.js, utils/storage.js, utils/exporter.js.
 */

/** Builds the toolbar DOM element for prompt and history actions. */
const createToolbar = async () => {
  const toolbar = document.createElement('section');
  toolbar.className = 'pn-toolbar';
  toolbar.innerHTML = `
    <div class="pn-toolbar__brand">PromptNest</div>
    <div class="pn-toolbar__actions">
      <button class="pn-btn" data-pn-action="save">Save Chat</button>
      <button class="pn-btn" data-pn-action="copy">Copy Last Reply</button>
      <button class="pn-btn" data-pn-action="export">Export MD</button>
    </div>
    <div class="pn-toolbar__status" data-pn-status>Ready</div>
  `;

  return toolbar;
};

/** Updates toolbar status text for quick user feedback. */
const setStatus = async (toolbar, message) => {
  const statusNode = toolbar.querySelector('[data-pn-status]');

  if (!statusNode) {
    return;
  }

  statusNode.textContent = message;
};

/** Handles Save Chat action by scraping and persisting the current conversation. */
const onSaveClick = async (toolbar) => {
  const platform = await window.PromptNestPlatform.detect();
  const chat = await window.PromptNestScraper.scrape();
  await window.PromptNestStorage.createChatHistory({ ...chat, platform });
  await setStatus(toolbar, 'Chat saved');
};

/** Handles Copy Last Reply action by copying the newest assistant response. */
const onCopyClick = async (toolbar) => {
  const chat = await window.PromptNestScraper.scrape();
  const assistantMessages = chat.messages.filter((item) => item.role === 'assistant');
  const latest = assistantMessages[assistantMessages.length - 1];

  if (!latest) {
    await setStatus(toolbar, 'No assistant reply found');
    return;
  }

  await navigator.clipboard.writeText(latest.text);
  await setStatus(toolbar, 'Last reply copied');
};

/** Handles Export action by exporting scraped chat in markdown format. */
const onExportClick = async (toolbar) => {
  const chat = await window.PromptNestScraper.scrape();
  await window.PromptNestExporter.exportChat(chat, 'markdown');
  await setStatus(toolbar, 'Export complete');
};

/** Wires toolbar buttons to action handlers. */
const attachHandlers = async (toolbar) => {
  const saveButton = toolbar.querySelector('[data-pn-action="save"]');
  const copyButton = toolbar.querySelector('[data-pn-action="copy"]');
  const exportButton = toolbar.querySelector('[data-pn-action="export"]');

  if (saveButton) {
    saveButton.addEventListener('click', () => {
      void onSaveClick(toolbar);
    });
  }

  if (copyButton) {
    copyButton.addEventListener('click', () => {
      void onCopyClick(toolbar);
    });
  }

  if (exportButton) {
    exportButton.addEventListener('click', () => {
      void onExportClick(toolbar);
    });
  }
};

/** Injects toolbar into the current page if it is not already mounted. */
const injectToolbar = async () => {
  if (document.querySelector('.pn-toolbar')) {
    return;
  }

  const platform = await window.PromptNestPlatform.detect();
  const selectors = await window.PromptNestPlatform.getSelectors(platform);
  const anchor = selectors?.toolbarAnchor ? document.querySelector(selectors.toolbarAnchor) : document.body;

  if (!anchor) {
    return;
  }

  const toolbar = await createToolbar();
  await attachHandlers(toolbar);

  if (anchor.firstChild) {
    anchor.insertBefore(toolbar, anchor.firstChild);
    return;
  }

  anchor.appendChild(toolbar);
};

/** Injects toolbar once now and on future DOM changes using MutationObserver. */
const waitAndInject = async () => {
  await injectToolbar();

  const observer = new MutationObserver(() => {
    void injectToolbar();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
};

const Toolbar = {
  createToolbar,
  attachHandlers,
  injectToolbar,
  waitAndInject
};

if (typeof window !== 'undefined') {
  window.PromptNestToolbar = Toolbar;
}
