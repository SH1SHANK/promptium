import { byId, assertElement } from '../shared/utils/dom-safe';
import { promptSearchIndex } from '../prompt/search/search';
import { PromptStore } from '../prompt/storage/storage';
import { KEYS, ONBOARDING_CARDS, state, isEditableField } from '../prompt/state/state';
import { PromptForm } from '../prompt/builder/builder';
import { PromptsUI } from '../prompt/library/library';
import { TagsUI } from '../prompt/library/tags-ui';
const MODAL_SCROLL_LOCK_CLASS = 'pn-modal-open';
let modalLockObserver: MutationObserver | null = null;

const getOnboardingIconClass = (card: any) => String(card?.iconClass || 'pn-card-icon--violet');

const renderOnboardingCard = async (card: any, index: any) => `
  <section class="pn-onboarding-card" data-onboard-index="${index}">
    <div class="pn-ob-visual">
      <span class="pn-card-icon ${getOnboardingIconClass(card)}">${card.icon}</span>
    </div>
    <p class="pn-card-sub">${card.subheadline}</p>
    <h2 class="pn-ob-headline" data-text="${card.headline}">${card.headline}</h2>
    <p class="pn-ob-subline">${card.body}</p>
    ${
      card.isLaunch
        ? `<div class="pn-onboard-actions">
            <button class="pn-onboarding-primary" type="button" data-action="onboard-get-started">Get Started</button>
            <button class="pn-onboard-btn" type="button" data-action="onboard-open-library">Open Library</button>
            <button class="pn-onboard-btn" type="button" data-action="onboard-go-settings">Go to Settings</button>
          </div>`
        : `<div class="pn-onboard-actions">
            <button class="pn-onboarding-primary" type="button" data-action="onboard-next">Continue</button>
            <a class="pn-ob-skip" href="#" data-action="onboard-skip">Skip intro</a>
          </div>`
    }
  </section>
`;

const handleOnboardingAction = async (settings: any) => {
  const cards = Array.from(document.querySelectorAll('#pn-onboarding .pn-onboarding-card'));
  const dots = Array.from(document.querySelectorAll('#pn-onboarding .pn-ob-dot'));

  cards.forEach((card, index) => {
    card.classList.remove('active', 'exit');
  });
};

const updateOnboardingPositions = async () => {
  const cards = Array.from(document.querySelectorAll('#pn-onboarding .pn-onboarding-card'));
  const dots = Array.from(document.querySelectorAll('#pn-onboarding .pn-ob-dot'));

  cards.forEach((card: any, index: number) => {
    card.classList.remove('active', 'exit');
    if (index === state.onboardingIndex) {
      card.classList.add('active');
    }
  });

  dots.forEach((dot: any, index: number) => {
    dot.classList.remove('active', 'visited');
    if (index < state.onboardingIndex) {
      dot.classList.add('visited');
    }
    if (index === state.onboardingIndex) {
      dot.classList.add('active');
    }
  });

  /* Animate headline char-by-char for the active card */
  const activeCard = cards[state.onboardingIndex] as HTMLElement;
  if (activeCard) {
    const headlineEl = activeCard.querySelector('.pn-ob-headline') as HTMLElement;
    if (headlineEl) {
      const text = headlineEl.getAttribute('data-text') || headlineEl.textContent || '';
      headlineEl.setAttribute('data-text', text);
      headlineEl.textContent = text;
      /* Trigger charReveal using inline span injection */
      setTimeout(() => {
        headlineEl.innerHTML = '';
        text.split('').forEach((ch: string, i: number) => {
          if (ch === ' ') {
            headlineEl.appendChild(document.createTextNode('\u00A0'));
          } else {
            const span = document.createElement('span');
            span.className = 'char';
            span.textContent = ch;
            span.style.animationDelay = `${160 + i * 28}ms`;
            headlineEl.appendChild(span);
          }
        });
      }, 0);
    }

    /* Animate icon */
    const iconEl = activeCard.querySelector('.pn-card-icon') as HTMLElement;
    if (iconEl) {
      iconEl.style.animation = 'none';
      iconEl.style.opacity = '0';
      iconEl.style.transform = 'scale(0.7)';
      setTimeout(() => {
        iconEl.style.transition =
          'opacity 0.35s ease 80ms, transform 0.45s cubic-bezier(0.34,1.56,0.64,1) 80ms';
        iconEl.style.opacity = '1';
        iconEl.style.transform = 'scale(1)';
      }, 10);
    }

    /* Move glow orbs */
    const glowPositions = [
      { top: '25%', left: '35%', top2: '70%', left2: '65%' },
      { top: '60%', left: '50%', top2: '28%', left2: '22%' },
      { top: '30%', left: '20%', top2: '72%', left2: '62%' },
      { top: '65%', left: '55%', top2: '22%', left2: '35%' },
      { top: '22%', left: '60%', top2: '68%', left2: '28%' },
      { top: '55%', left: '30%', top2: '25%', left2: '65%' },
      { top: '40%', left: '40%', top2: '50%', left2: '55%' },
    ];
    const gp = glowPositions[state.onboardingIndex] ??
      glowPositions[0] ?? { top: '65%', left: '55%', top2: '22%', left2: '35%' };
    const glow = document.querySelector('#pn-onboarding .pn-onboarding-glow') as HTMLElement;
    const glow2 = document.querySelector('#pn-onboarding .pn-onboarding-glow-2') as HTMLElement;
    if (glow) {
      glow.style.top = gp.top;
      glow.style.left = gp.left;
    }
    if (glow2) {
      glow2.style.top = gp.top2;
      glow2.style.left = gp.left2;
    }
  }
};

const completeOnboarding = async () => {
  await chrome.storage.local.set({ [KEYS.ONBOARDING_KEY]: true });
  const overlay = byId('pn-onboarding');
  if (overlay) {
    overlay.classList.add('pn-ob-exit');
    await new Promise((r) => setTimeout(r, 350));
    overlay.remove();
  }
};

const onOnboardingNext = async () => {
  if (state.onboardingIndex < ONBOARDING_CARDS.length - 1) {
    /* Animate current card out */
    const cards = Array.from(document.querySelectorAll('#pn-onboarding .pn-onboarding-card'));
    const currentCard = cards[state.onboardingIndex] as HTMLElement;
    if (currentCard) {
      currentCard.classList.remove('active');
      currentCard.classList.add('exit');
      await new Promise((r) => setTimeout(r, 220));
      currentCard.classList.remove('exit');
    }
    state.onboardingIndex += 1;
    await updateOnboardingPositions();
    return false;
  }
  await completeOnboarding();
  return state.settings.improvePrompt;
};

const onOnboardingSkip = async () => {
  /* Animate current card out */
  const cards = Array.from(document.querySelectorAll('#pn-onboarding .pn-onboarding-card'));
  const currentCard = cards[state.onboardingIndex] as HTMLElement;
  if (currentCard) {
    currentCard.classList.remove('active');
    currentCard.classList.add('exit');
    await new Promise((r) => setTimeout(r, 220));
    currentCard.classList.remove('exit');
  }
  state.onboardingIndex = ONBOARDING_CARDS.length - 1;
  await updateOnboardingPositions();
};

const maybeRunOnboarding = async () => {
  const onboardingState = await chrome.storage.local.get([KEYS.ONBOARDING_KEY]);

  if (Boolean(onboardingState?.[KEYS.ONBOARDING_KEY])) {
    return false;
  }

  state.onboardingIndex = 0;
  const overlay = document.createElement('div');
  overlay.id = 'pn-onboarding';

  const cardsMarkup = await Promise.all(
    ONBOARDING_CARDS.map((card: any, index: number) => renderOnboardingCard(card, index))
  );
  const dotsMarkup = ONBOARDING_CARDS.map(
    (_: any, index: number) =>
      `<span class="pn-ob-dot visible${index === 0 ? ' active' : ''}"></span>`
  ).join('');

  overlay.innerHTML = `
    <div class="pn-ob-deck">${cardsMarkup.join('')}</div>
    <div class="pn-ob-dots">${dotsMarkup}</div>
  `;

  /* Dual ambient glow orbs */
  const glow = document.createElement('div');
  glow.className = 'pn-onboarding-glow';
  glow.style.top = '25%';
  glow.style.left = '35%';
  overlay.appendChild(glow);

  const glow2 = document.createElement('div');
  glow2.className = 'pn-onboarding-glow-2';
  glow2.style.top = '70%';
  glow2.style.left = '65%';
  overlay.appendChild(glow2);

  document.body.appendChild(overlay);
  await updateOnboardingPositions();

  let aiInitialized = false;

  overlay.addEventListener('click', (event: any) => {
    void (async () => {
      const action = String(event.target?.dataset?.action || '');

      if (action === 'onboard-skip') {
        event.preventDefault();
        await onOnboardingSkip();
        return;
      }

      if (action === 'onboard-next') {
        event.preventDefault();
        aiInitialized = await onOnboardingNext();
        return;
      }

      if (action === 'onboard-get-started') {
        event.preventDefault();
        await completeOnboarding();
        return;
      }

      if (action === 'onboard-open-library') {
        event.preventDefault();
        await completeOnboarding();
        await switchTab('prompts');
        return;
      }

      if (action === 'onboard-go-settings') {
        event.preventDefault();
        await completeOnboarding();
        await switchTab('settings');
      }
    })();
  });

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (!document.getElementById('pn-onboarding')) {
        clearInterval(interval);
        resolve(aiInitialized);
      }
    }, 120);
  });
};

const refreshHeaderControls = () => {
  const addPromptButton = document.getElementById('add-prompt-btn');
  const searchWrap = document.getElementById('search-wrap');
  const isPromptTab = state.activeTab === 'prompts';
  if (addPromptButton) addPromptButton.classList.toggle('hidden', !isPromptTab);
  if (searchWrap) {
    const isSearchTab = isPromptTab || state.activeTab === 'tags';
    searchWrap.classList.toggle('hidden', !isSearchTab);
  }
};

const isPopupMode = async () => {
  return true;
};

const syncPopupCloseButton = async () => {
  const closeBtn = document.getElementById('panel-close-btn');
  if (!closeBtn) return;
  closeBtn.classList.toggle('hidden', !(await isPopupMode()));
};

const switchTab = async (tabName: any) => {
  state.activeTab = 'prompts';

  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panes = Array.from(document.querySelectorAll('.tab-content'));

  tabs.forEach((tab: any) => {
    tab.classList.toggle('active', tab.dataset.tab === 'prompts');
  });

  panes.forEach((pane: any) => {
    pane.classList.toggle('active', pane.dataset.tab === 'prompts');
  });

  const tabBar = document.querySelector('.pn-tab-bar');
  const searchWrap = document.getElementById('search-wrap');
  const backBtn = document.getElementById('back-btn');
  const headerPageTitle = document.getElementById('header-page-title');
  const addPromptBtn = document.getElementById('add-prompt-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  if (tabBar) tabBar.classList.remove('hidden');
  if (searchWrap) searchWrap.classList.remove('hidden');

  if (backBtn) backBtn.classList.add('hidden');
  if (addPromptBtn) addPromptBtn.classList.remove('hidden');
  if (settingsBtn) settingsBtn.classList.add('hidden');
  if (refreshBtn) refreshBtn.classList.remove('hidden');

  if (headerPageTitle) {
    headerPageTitle.classList.add('hidden');
    headerPageTitle.textContent = '';
  }

  refreshHeaderControls();

  const searchInput = document.getElementById('prompt-search') as HTMLInputElement;
  if (searchInput) {
    searchInput.placeholder = 'Search prompts by title, text, or tags';
  }

  const searchBadge = document.getElementById('pn-search-mode-badge');
  const searchSpark = document.getElementById('pn-search-spark');
  const modelFeedback = document.getElementById('pn-model-feedback');
  [searchBadge, searchSpark, modelFeedback].forEach((node) => {
    if (!node) return;
    node.classList.add('pn-hidden');
  });

  if (PromptsUI?.resetTemplateFilter) {
    PromptsUI.resetTemplateFilter();
  }
};

const performWorkspaceRefresh = async () => {
  await PromptsUI.render(PromptsUI.getSearchValue());
  await TagsUI.render();
};

const bindSessionPayloadUpdates = async () => {
  chrome.storage.onChanged.addListener((changes: any, areaName: string) => {
    if (areaName !== 'local' || !changes.prompts) {
      return;
    }

    void (async () => {
      // Sync search index
      const newPromptsList = changes.prompts.newValue || [];
      promptSearchIndex.setPrompts(newPromptsList);

      // Render lists
      const searchInputVal = PromptsUI?.getSearchValue?.() || '';
      await PromptsUI?.render?.(searchInputVal);
      await TagsUI?.render?.();

      // Synchronize Detail Preview Box
      const { searchController } = await import('../prompt/search/search');
      const activePromptId = searchController.selectedPromptId;
      if (activePromptId) {
        const updatedPrompt = newPromptsList.find((p: any) => p.id === activePromptId);
        if (updatedPrompt) {
          await PromptsUI?.openPreviewPanel?.(updatedPrompt);
        } else {
          PromptsUI?.closePreviewPanel?.();
        }
      }
    })();
  });

  chrome.storage.onChanged.addListener((changes: any, areaName: string) => {
    if (areaName !== 'local' || !changes[KEYS.PENDING_SNIPPET_KEY]) {
      return;
    }

    if (!state.initialized) {
      state.pendingActions.push({ type: 'pendingSnippet' });
      return;
    }

    void consumePendingSnippet();
  });
};

const bindShellEvents = async () => {
  Array.from(document.querySelectorAll('.tab')).forEach((tab: any) => {
    tab.addEventListener('click', () => {
      if (tab.id === 'pn-nav-new-prompt') {
        void PromptForm.open();
      } else {
        void switchTab(String(tab.dataset.tab || 'prompts'));
      }
    });
  });

  document.getElementById('add-prompt-btn')?.addEventListener('click', () => {
    void PromptForm.open();
  });

  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    void performWorkspaceRefresh();
  });

  document.getElementById('pn-standalone-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('app.html?mode=standalone') });
  });
  document.getElementById('panel-close-btn')?.addEventListener('click', () => {
    window.close();
  });

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    // 1. Meta/Ctrl + N: New Prompt
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      void PromptForm.open();
      return;
    }

    // 2. Meta/Ctrl + S: Save Prompt
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      const modal = document.getElementById('add-modal');
      if (modal && !modal.classList.contains('pn-hidden')) {
        event.preventDefault();
        void PromptForm.save();
        return;
      }
    }

    // 3. Meta/Ctrl + D: Duplicate selected prompt
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      const selected = document.querySelector(
        '.pn-prompt-card.pn-card--selected'
      ) as HTMLElement | null;
      if (selected) {
        event.preventDefault();
        (selected.querySelector('.pn-action-duplicate') as HTMLElement | null)?.click();
        return;
      }
    }

    // 4. Arrow keys: navigation
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && state.activeTab === 'prompts') {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !isEditableField(active)) {
        const cards = Array.from(document.querySelectorAll('.pn-prompt-card'));
        if (cards.length > 0) {
          event.preventDefault();
          const selectedIdx = cards.findIndex((c) => c.classList.contains('pn-card--selected'));
          let nextIdx = 0;
          if (selectedIdx !== -1) {
            if (event.key === 'ArrowDown') {
              nextIdx = Math.min(cards.length - 1, selectedIdx + 1);
            } else {
              nextIdx = Math.max(0, selectedIdx - 1);
            }
          } else if (event.key === 'ArrowUp') {
            nextIdx = cards.length - 1;
          }
          const nextCard = cards[nextIdx] as HTMLElement;
          if (nextCard) {
            nextCard.click();
            nextCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
        return;
      }
    }

    // 5. / Key: Focus Search
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const active = document.activeElement;
      if (!isEditableField(active)) {
        const searchInput = PromptsUI.getSearchInput();
        const searchWrap = PromptsUI.getSearchWrap();
        if (searchInput && !searchWrap?.classList.contains('pn-hidden')) {
          event.preventDefault();
          PromptsUI.focusSearch();
        }
        return;
      }
    }

    // 6. Meta/Ctrl + Enter: Use Prompt
    if (
      event.key === 'Enter' &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      state.activeTab === 'prompts'
    ) {
      event.preventDefault();
      const selected = document.querySelector(
        '.pn-prompt-card.pn-card--selected'
      ) as HTMLElement | null;
      if (selected) {
        (selected.querySelector('.pn-action-use') as HTMLElement | null)?.click();
      }
      return;
    }

    const isFocusShortcut =
      event.key.toLowerCase() === 'k' &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey;
    if (isFocusShortcut) {
      event.preventDefault();
      void openCommandPalette();
      return;
    }

    if (event.key !== 'Escape') return;
    if (!document.getElementById('pn-command-palette')?.classList.contains('pn-hidden')) {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (!document.getElementById('pn-improve-modal')?.classList.contains('pn-hidden')) {
      window.ImproveUI.close();
      return;
    }
    if (!document.getElementById('add-modal')?.classList.contains('pn-hidden')) {
      void PromptForm.close();
      return;
    }
    const previewPanel = document.getElementById('pn-prompt-detail-panel');
    if (previewPanel && !previewPanel.classList.contains('pn-hidden')) {
      event.preventDefault();
      PromptsUI.closePreviewPanel();
      return;
    }
    const searchInput = PromptsUI.getSearchInput() as HTMLInputElement | null;
    if (document.activeElement === searchInput && String(searchInput?.value || '').trim()) {
      event.preventDefault();
      PromptsUI.clearSearch();
    }
  });
};

const bindModalScrollLock = () => {
  if (modalLockObserver) return;

  const modals = Array.from(document.querySelectorAll('.pn-modal'));
  if (!modals.length) {
    syncModalScrollLock();
    return;
  }

  modalLockObserver = new MutationObserver(() => {
    syncModalScrollLock();
  });

  modals.forEach((modal) => {
    modalLockObserver!.observe(modal, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  syncModalScrollLock();
};

const syncModalScrollLock = () => {
  const hasOpenModal = Array.from(document.querySelectorAll('.pn-modal')).some(
    (node) => !node.classList.contains('pn-hidden')
  );
  document.body.classList.toggle(MODAL_SCROLL_LOCK_CLASS, hasOpenModal);
};

const handleShowExport = async () => {
  const incoming = await window.ExportPayloadUI.loadPayload();
  await window.ExportPayloadUI.ingestIncomingPayload(incoming);
  await switchTab('export');
  await window.ExportPayloadUI.renderPreview();
  await window.ExportPayloadUI.renderMeta();

  if (state.exportSnapshotPayload?.messages?.length) {
    await window.ExportPayloadUI.setStatus('Selection loaded.');
  }
};

const handleShowContinuation = async () => {
  if (!window.ContinuationUI?.openFromActiveTab) {
    return;
  }
  const opened = await window.ContinuationUI.openFromActiveTab();
  if (!opened) {
    await switchTab('prompts');
  }
};

const commandState: { items: any[]; activeIndex: number } = {
  items: [],
  activeIndex: 0,
};

const closeCommandPalette = () => {
  document.getElementById('pn-command-palette')?.classList.add('pn-hidden');
};

const runCommand = async (command: any) => {
  closeCommandPalette();
  if (!command) return;

  if (command.type === 'prompt') {
    await switchTab('prompts');
    const search = PromptsUI.getSearchInput() as HTMLInputElement | null;
    if (search) search.value = command.title;
    await PromptsUI.render(command.title);
    return;
  }

  if (typeof command.execute === 'function') {
    await command.execute();
  }
};

const renderCommandPalette = async (query = '') => {
  const results = document.getElementById('pn-command-results');
  if (!results) return;
  const normalized = String(query || '')
    .trim()
    .toLowerCase();
  const staticCommands = window.commandPalette.getAllCommands();
  const prompts = await PromptStore.getPrompts().catch(() => []);
  const promptCommands = (Array.isArray(prompts) ? prompts : [])
    .slice(0, 200)
    .map((prompt: any) => ({
      title: String(prompt.title || 'Untitled Prompt'),
      subtitle: [prompt.category, ...(prompt.tags || [])].filter(Boolean).join(' · '),
      type: 'prompt',
    }));
  commandState.items = [...staticCommands, ...promptCommands]
    .filter((item: any) => {
      if (!normalized) return true;
      return `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(normalized);
    })
    .slice(0, 12);
  commandState.activeIndex = Math.min(
    commandState.activeIndex,
    Math.max(0, commandState.items.length - 1)
  );
  results.innerHTML = '';
  commandState.items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pn-command-result';
    button.classList.toggle('is-active', index === commandState.activeIndex);
    button.innerHTML = `<span>${item.title}</span><small>${item.subtitle || ''}</small>`;
    button.addEventListener('click', () => {
      void runCommand(item);
    });
    results.appendChild(button);
  });
};

const openCommandPalette = async () => {
  const palette = document.getElementById('pn-command-palette');
  const input = document.getElementById('pn-command-input') as HTMLInputElement | null;
  if (!palette || !input) return;
  palette.classList.remove('pn-hidden');
  input.value = '';
  commandState.activeIndex = 0;
  await renderCommandPalette('');
  input.focus();
};

const bindCommandPalette = () => {
  const palette = document.getElementById('pn-command-palette');
  const input = document.getElementById('pn-command-input') as HTMLInputElement | null;
  if (!palette || !input || palette.dataset.bound === 'true') return;
  palette.dataset.bound = 'true';
  palette.querySelector('[data-command-close]')?.addEventListener('click', closeCommandPalette);
  input.addEventListener('input', () => {
    commandState.activeIndex = 0;
    void renderCommandPalette(input.value);
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const max = Math.max(0, commandState.items.length - 1);
      commandState.activeIndex = Math.min(max, Math.max(0, commandState.activeIndex + delta));
      void renderCommandPalette(input.value);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void runCommand(commandState.items[commandState.activeIndex]);
    }
  });
};

const consumePendingSnippet = async () => {
  try {
    const snapshot = (await chrome.storage.local.get([KEYS.PENDING_SNIPPET_KEY])) as Record<
      string,
      any
    >;
    const snippet = snapshot?.[KEYS.PENDING_SNIPPET_KEY];
    const text = String(snippet?.text || '').trim();
    if (!text) {
      return false;
    }

    await chrome.storage.local.remove([KEYS.PENDING_SNIPPET_KEY]).catch(() => {});
    await switchTab('prompts');
    await PromptForm.openPlainPrefilled(text, snippet?.sourceUrl || '');
    return true;
  } catch (_error) {
    return false;
  }
};

const consumePendingPanelAction = async () => {
  try {
    const snapshot = await chrome.storage.session.get([KEYS.PENDING_PANEL_ACTION_KEY]);
    const rawAction = snapshot?.[KEYS.PENDING_PANEL_ACTION_KEY];
    if (!rawAction) {
      return null;
    }
    await chrome.storage.session.remove([KEYS.PENDING_PANEL_ACTION_KEY]).catch(() => {});

    const normalized = (typeof rawAction === 'string' ? { type: rawAction } : rawAction) as Record<
      string,
      unknown
    >;
    if (!normalized?.type) {
      return null;
    }
    state.pendingActions.push(normalized);
    return normalized;
  } catch (_error) {
    return null;
  }
};

const registerEarlyListeners = () => {};

const flushPendingActions = async () => {
  const queue = Array.from(state.pendingActions);
  state.pendingActions = [];

  for (const action of queue) {
    if (action.type === 'pendingSnippet') {
      await consumePendingSnippet();
    }
  }
};

const init = async () => {
  // 1. Theme Init
  try {
    const settingsSnap = await chrome.storage.local.get([KEYS.SETTINGS_KEY]);
    const theme = (settingsSnap?.[KEYS.SETTINGS_KEY] as any)?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('pn-dark-theme');
    } else {
      document.body.classList.remove('pn-dark-theme');
    }
  } catch (err) {
    console.error('[Promptium] Theme initialization failed:', err);
  }

  // 2. Storage Init
  // Handled inherently by WXT/Chrome context.

  // 3. Prompt Store & Search Index Init
  try {
    const prompts = await PromptStore.getPrompts();
    promptSearchIndex.setPrompts(prompts);
  } catch (err) {
    console.error('[Promptium] Prompt Store & Search Index initialization failed:', err);
  }

  // Detect Standalone Tab Mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'standalone') {
    document.body.classList.add('pn-standalone-mode');
  }

  // Command Palette Setup
  try {
    if (typeof window.createBuiltinCommands === 'function') {
      window.commandPalette.registerCommands(window.createBuiltinCommands());
    }
  } catch (err) {
    console.error('[Promptium] Command palette registration failed:', err);
  }

  // Header close button setup
  try {
    const header = document.querySelector('.pn-header-actions');
    if (header && !document.getElementById('popup-close-btn')) {
      const closeBtn = document.createElement('button');
      closeBtn.id = 'popup-close-btn';
      closeBtn.className = 'pn-btn pn-btn--ghost pn-icon-btn pn-popup-close';
      closeBtn.type = 'button';
      closeBtn.title = 'Close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `;
      closeBtn.addEventListener('click', () => {
        window.close();
      });
      header.appendChild(closeBtn);
    }
  } catch (err) {
    console.error('[Promptium] Close button registration failed:', err);
  }

  // 4. Prompt Library Setup
  try {
    PromptsUI?.setCallbacks?.({
      onPromptsMutated: () => TagsUI?.render?.(),
    });
    PromptsUI?.initToolbar?.();
  } catch (err) {
    console.error('[Promptium] PromptsUI callbacks setup failed:', err);
  }

  try {
    TagsUI?.setCallbacks?.({
      onApplyTagFilter: async (filterValue: string) => {
        const loadPromptLibraryTab = async (filter: string) => {
          const search = document.getElementById('prompt-search') as HTMLInputElement;
          if (search) search.value = filter;
          await switchTab('prompts');
          await PromptsUI?.render?.(filter);
        };
        await loadPromptLibraryTab(filterValue);
      },
      onTagsMutated: async () => {
        await PromptsUI?.render?.(PromptsUI?.getSearchValue?.() || '');
      },
    });
  } catch (err) {
    console.error('[Promptium] TagsUI callbacks setup failed:', err);
  }

  // 5. Prompt Builder Setup
  try {
    PromptForm?.setCallbacks?.({
      onPromptSaved: async () => {
        await PromptsUI?.render?.(PromptsUI?.getSearchValue?.() || '');
        await TagsUI?.render?.();
      },
    });
    PromptForm?.bindEvents?.();
  } catch (err) {
    console.error('[Promptium] PromptForm callbacks setup failed:', err);
  }

  // 6. Bind Events
  try {
    await bindShellEvents();
  } catch (err) {
    console.error('[Promptium] bindShellEvents failed:', err);
  }
  try {
    bindCommandPalette();
  } catch (err) {
    console.error('[Promptium] bindCommandPalette failed:', err);
  }
  try {
    await syncPopupCloseButton();
  } catch (err) {
    console.error('[Promptium] syncPopupCloseButton failed:', err);
  }
  try {
    bindModalScrollLock();
  } catch (err) {
    console.error('[Promptium] bindModalScrollLock failed:', err);
  }

  // 7. Keyboard Shortcuts Binds
  // Binds are handled inside bindShellEvents / keydown window listeners

  // 8. Platform Integration
  try {
    await bindSessionPayloadUpdates();
  } catch (err) {
    console.error('[Promptium] bindSessionPayloadUpdates failed:', err);
  }

  try {
    await switchTab('prompts');
  } catch (err) {
    console.error('[Promptium] switchTab failed:', err);
  }

  // Initial render consuming from search index
  try {
    const currentQuery = PromptsUI?.getSearchValue?.() || '';
    await PromptsUI?.render?.(currentQuery);
  } catch (err) {
    console.error('[Promptium] PromptsUI render failed:', err);
  }
  try {
    await consumePendingSnippet();
  } catch (err) {
    console.error('[Promptium] consumePendingSnippet failed:', err);
  }

  try {
    await maybeRunOnboarding();
  } catch (err) {
    console.error('[Promptium] Onboarding execution failed:', err);
  }

  state.initialized = true;

  try {
    await flushPendingActions();
  } catch (err) {
    console.error('[Promptium] flushPendingActions failed:', err);
  }

  // Prefilled or draft recovery bootstrap check
  try {
    const snap = await chrome.storage.local.get(['pn_prefilled_draft', 'active_draft_session_id']);
    if (snap.pn_prefilled_draft) {
      void PromptForm.open();
    } else if (snap.active_draft_session_id) {
      const sessionId = snap.active_draft_session_id;
      if (sessionId === 'new') {
        void PromptForm.open();
      } else {
        const prompts = await PromptStore.getPrompts();
        const matched = prompts.find((p: any) => p.id === sessionId);
        if (matched) {
          void PromptForm.openForEdit(matched);
        } else {
          await chrome.storage.local.remove(['active_draft_session_id']);
        }
      }
    }
  } catch (err) {
    console.error('[Promptium] Draft recovery check failed:', err);
  }

  window.addEventListener('focus', () => {
    void consumePendingSnippet();
  });
};

export const AppShell = {
  switchTab,
  refreshHeaderControls,
};

export const SidepanelInit = {
  registerEarlyListeners,
  init,
};

if (typeof window !== 'undefined') {
  (window as any).AppShell = AppShell;
  (window as any).SidepanelInit = SidepanelInit;
}

registerEarlyListeners();

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    const banner = document.createElement('div');
    banner.className = 'pn-init-error-banner';
    banner.textContent = `Initialization failed: ${err?.message || 'Unknown error.'} Open Settings and retry.`;
    document.body.appendChild(banner);
  });
});
