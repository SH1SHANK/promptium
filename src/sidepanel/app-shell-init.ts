import { byId, assertElement } from '../utils/dom-safe';

(() => {
  /**
   * File: sidepanel/app-shell-init.js
   * Purpose: Sidepanel bootstrapping, shell navigation, onboarding, and early listener queue.
   */

  const { KEYS, ONBOARDING_CARDS, state, isEditableField } = window.SidepanelState;
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
      const gp = glowPositions[state.onboardingIndex] ?? glowPositions[0] ?? { top: '65%', left: '55%', top2: '22%', left2: '35%' };
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
    return state.settings.enableAI;
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
      (_: any, index: number) => `<span class="pn-ob-dot visible${index === 0 ? ' active' : ''}"></span>`
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
    const requested = String(tabName || 'prompts');

    if (requested === 'export') {
      await loadExportFeature();
    } else if (requested === 'continue') {
      await loadContinuationFeature();
    } else if (requested === 'vault') {
      const { initVaultUI } = await import('../features/vault/vault-ui');
      await initVaultUI();
    }

    const tabs = Array.from(document.querySelectorAll('.tab'));
    const panes = Array.from(document.querySelectorAll('.tab-content'));

    const isStandaloneView = ['settings', 'export', 'continue'].includes(tabName);

    state.activeTab = String(tabName || 'prompts');

    tabs.forEach((tab: any) => {
      tab.classList.toggle('active', tab.dataset.tab === state.activeTab);
    });

    panes.forEach((pane: any) => {
      pane.classList.toggle('active', pane.dataset.tab === state.activeTab);
    });

    const tabBar = document.querySelector('.pn-tab-bar');
    const searchWrap = document.getElementById('search-wrap');
    const backBtn = document.getElementById('back-btn');
    const headerPageTitle = document.getElementById('header-page-title');
    const addPromptBtn = document.getElementById('add-prompt-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const refreshBtn = document.getElementById('refresh-btn');

    if (tabBar) tabBar.classList.toggle('hidden', isStandaloneView);
    if (searchWrap) {
      searchWrap.classList.toggle('hidden', isStandaloneView);
    }

    if (backBtn) backBtn.classList.toggle('hidden', !isStandaloneView);
    if (addPromptBtn) addPromptBtn.classList.toggle('hidden', isStandaloneView);
    if (settingsBtn) settingsBtn.classList.toggle('hidden', isStandaloneView);
    if (refreshBtn) refreshBtn.classList.toggle('hidden', isStandaloneView);

    if (headerPageTitle) {
      headerPageTitle.classList.toggle('hidden', !isStandaloneView);
      const pageTitles: Record<string, string> = { settings: 'Settings', export: 'Export', continue: 'Continue' };
      headerPageTitle.textContent = pageTitles[tabName] || '';
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

    if (state.activeTab === 'prompts' && window.PromptsUI?.resetTemplateFilter) {
      window.PromptsUI.resetTemplateFilter();
    }

    if (state.activeTab === 'export') {
      if (!state.exportSnapshotPayload) {
        state.exportSnapshotPayload = window.SessionStorage.cloneExportPayload(state.exportPayload);
      }
      await window.ExportPayloadUI.renderMeta();
    }
  };

  const performWorkspaceRefresh = async () => {
    await window.PromptsUI.render(window.PromptsUI.getSearchValue());
    await window.TagsUI.render();
  };

  const bindSessionPayloadUpdates = async () => {
    chrome.storage.onChanged.addListener((changes: any, areaName: string) => {
      const payloadChange = changes[KEYS.SIDEPANEL_SESSION_KEY];
      if (areaName !== 'session' || !payloadChange) {
        return;
      }

      void (async () => {
        await window.ExportPayloadUI.ingestIncomingPayload(payloadChange.newValue);
        if (window.ExportPayloadUI.hasPayloadMessages(state.exportPayload)) {
          await switchTab('export');
        }
      })();
    });

    chrome.storage.onChanged.addListener((changes: any, areaName: string) => {
      if (areaName !== 'local' || !changes.prompts) {
        return;
      }

      void (async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
        await window.TagsUI.render();
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
        void switchTab(String(tab.dataset.tab || 'prompts'));
      });
    });

    document.getElementById('settings-btn')?.addEventListener('click', () => {
      void switchTab('settings');
    });

    document.getElementById('back-btn')?.addEventListener('click', () => {
      void switchTab('prompts');
    });

    document.getElementById('add-prompt-btn')?.addEventListener('click', () => {
      void window.PromptForm.open();
    });

    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      void performWorkspaceRefresh();
    });
    document.getElementById('panel-close-btn')?.addEventListener('click', () => {
      window.close();
    });

    document.getElementById('pn-smart-close')?.addEventListener('click', () => {
      document.getElementById('pn-smart-strip')?.classList.add('pn-hidden');
    });

    document.getElementById('pn-prompts-continue-chat')?.addEventListener('click', () => {
      void handleShowContinuation();
    });

    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const active = document.activeElement;
        if (!isEditableField(active)) {
          const searchInput = window.PromptsUI.getSearchInput();
          const searchWrap = window.PromptsUI.getSearchWrap();
          if (searchInput && !searchWrap?.classList.contains('hidden')) {
            event.preventDefault();
            window.PromptsUI.focusSearch();
          }
          return;
        }
      }

      if (
        event.key === 'Enter' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        state.activeTab === 'prompts'
      ) {
        event.preventDefault();
        void window.PromptsUI.insertSelectedPrompt?.();
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
      if (window.TemplateFill?.isOpen?.()) {
        event.preventDefault();
        window.TemplateFill.closeActiveForm?.();
        return;
      }
      if (!document.getElementById('pn-improve-modal')?.classList.contains('pn-hidden')) {
        window.ImproveUI.close();
        return;
      }
      if (!document.getElementById('add-modal')?.classList.contains('pn-hidden')) {
        void window.PromptForm.close();
        return;
      }
      const searchInput = window.PromptsUI.getSearchInput() as HTMLInputElement | null;
      if (document.activeElement === searchInput && String(searchInput?.value || '').trim()) {
        event.preventDefault();
        window.PromptsUI.clearSearch();
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
      const search = window.PromptsUI.getSearchInput() as HTMLInputElement | null;
      if (search) search.value = command.title;
      await window.PromptsUI.render(command.title);
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
    const prompts = await (window.PromptStore || window.Store)?.getPrompts?.().catch(() => []);
    const promptCommands = (Array.isArray(prompts) ? prompts : []).slice(0, 200).map((prompt: any) => ({
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
      const snapshot = (await chrome.storage.local.get([KEYS.PENDING_SNIPPET_KEY])) as Record<string, any>;
      const snippet = snapshot?.[KEYS.PENDING_SNIPPET_KEY];
      const text = String(snippet?.text || '').trim();
      if (!text) {
        return false;
      }

      await chrome.storage.local.remove([KEYS.PENDING_SNIPPET_KEY]).catch(() => {});
      await switchTab('prompts');
      await window.PromptForm.openPlainPrefilled(text, snippet?.sourceUrl || '');
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

      const normalized = (typeof rawAction === 'string' ? { type: rawAction } : rawAction) as Record<string, unknown>;
      if (!normalized?.type) {
        return null;
      }
      state.pendingActions.push(normalized);
      return normalized;
    } catch (_error) {
      return null;
    }
  };

  const handleImprovePayload = async (payload: any) => {
    const normalizedImprove = window.ImproveUI.normalizePayload(payload);
    chrome.storage.local.remove([KEYS.IMPROVE_PAYLOAD_KEY]).catch(() => {});
    if (normalizedImprove.text) {
      void window.ImproveUI.open(null, normalizedImprove.text, normalizedImprove.tags, {
        context: 'fab',
        sourceTabId: normalizedImprove.sourceTabId,
      });
    }
  };

  const registerEarlyListeners = () => {
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg?.action !== 'showExport') return;

      if (!state.initialized) {
        state.pendingActions.push({ type: 'showExport' });
        return true;
      }

      void handleShowExport().catch((err: any) => {
        console.warn('[Promptium] showExport handler error:', err);
      });

      return true;
    });

    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg?.action !== 'showContinuation') return;

      if (!state.initialized) {
        state.pendingActions.push({ type: 'showContinuation' });
        return true;
      }

      void handleShowContinuation().catch((err: any) => {
        console.warn('[Promptium] showContinuation handler error:', err);
      });

      return true;
    });

    chrome.storage.onChanged.addListener((changes: any) => {
      const improveChange = changes[KEYS.IMPROVE_PAYLOAD_KEY];
      if (!improveChange?.newValue) {
        return;
      }

      if (!state.initialized) {
        state.pendingActions.push({
          type: 'improvePayload',
          payload: improveChange.newValue,
        });
        return;
      }

      void handleImprovePayload(improveChange.newValue);
    });
  };

  const flushPendingActions = async () => {
    const queue = Array.from(state.pendingActions);
    state.pendingActions = [];

    for (const action of queue) {
      if (action.type === 'showExport') {
        await handleShowExport();
        continue;
      }
      if (action.type === 'improvePayload') {
        await handleImprovePayload(action.payload);
        continue;
      }
      if (action.type === 'showContinuation') {
        await handleShowContinuation();
        continue;
      }
      if (action.type === 'pendingSnippet') {
        await consumePendingSnippet();
      }
    }
  };

  let exportFeatureLoaded = false;
  const loadExportFeature = async () => {
    if (exportFeatureLoaded) return;
    exportFeatureLoaded = true;

    await import('../utils/export-preview-renderer');
    await import('../services/export-service');
    await import('../features/export');

    window.ExportPayloadUI.setCallbacks({
      onRunExport: () => window.ExportActionsUI.runExport(),
      onSelectMessages: () => window.ExportActionsUI.selectMessagesForExport(),
    });
    window.ExportPayloadUI.bindEvents();
    window.ExportActionsUI.bindEvents();

    window.ExportPayloadUI.applyDefaultsFromSettings(state.settings);
    const initialExportPayload = await window.ExportPayloadUI.loadPayload();
    state.exportSnapshotPayload = window.SessionStorage.cloneExportPayload(initialExportPayload);
    
    if (state.exportSnapshotPayload?.messages?.length) {
      await window.ExportPayloadUI.setStatus('Selection loaded.');
    } else {
      await window.ExportPayloadUI.setStatus(
        'Select messages in chat, then click Export Selected.',
        false
      );
    }
    await window.ExportPayloadUI.renderPreview();
  };

  let continuationFeatureLoaded = false;
  const loadContinuationFeature = async () => {
    if (continuationFeatureLoaded) return;
    continuationFeatureLoaded = true;

    await import('../features/continuation');
    window.ContinuationUI?.bindEvents?.();
  };

  let refinementFeatureLoaded = false;
  const loadRefinementFeature = async () => {
    if (refinementFeatureLoaded) return;
    refinementFeatureLoaded = true;

    await import('../features/refinement');
    window.ImproveUI.setCallbacks({
      onLibraryChanged: async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
        await window.TagsUI.render();
      },
      onPromptTextReplaced: () => window.PromptForm.prefillSuggestedTags(),
      onSwitchTab: (tabName: string) => switchTab(tabName),
    });
    window.ImproveUI.bindEvents();
  };

  const init = async () => {
    if (typeof window.createBuiltinCommands === 'function') {
      window.commandPalette.registerCommands(window.createBuiltinCommands());
    }

    const header = document.querySelector('.pn-header-actions');
    if (header) {
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

    window.PromptsUI.setCallbacks({
      onOpenImprove: async (promptId: string, text: string, tags: string[], options: any = {}) => {
        await loadRefinementFeature();
        window.ImproveUI.open(promptId, text, tags, options);
      },
      onPromptsMutated: () => window.TagsUI.render(),
    });

    window.PromptForm.setCallbacks({
      onPromptSaved: async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
        await window.TagsUI.render();
      },
      onOpenImprove: async (promptId: string, text: string, tags: string[], options: any = {}) => {
        await loadRefinementFeature();
        window.ImproveUI.open(promptId, text, tags, options);
      },
    });

    window.TagsUI.setCallbacks({
      onApplyTagFilter: async (filterValue: string) => {
        const loadPromptLibraryTab = async (filter: string) => {
          const search = document.getElementById('prompt-search') as HTMLInputElement;
          if (search) search.value = filter;
          await switchTab('prompts');
          await window.PromptsUI.render(filter);
        };
        await loadPromptLibraryTab(filterValue);
      },
      onTagsMutated: async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
      },
    });

    window.SettingsAI?.setCallbacks?.({
      onApplyExportDefaults: (settings: any) => {
        if (window.ExportPayloadUI) {
          window.ExportPayloadUI.applyDefaultsFromSettings(settings);
        }
      },
      onRenderExportPreview: () => {
        if (window.ExportPayloadUI) {
          window.ExportPayloadUI.renderPreview();
        }
      },
      onLoadSmartSuggestions: () => window.PromptsUI.loadSmartSuggestions(),
    });

    await bindShellEvents();
    bindCommandPalette();
    await syncPopupCloseButton();
    bindModalScrollLock();
    window.PromptsUI.bindSearchHandlers();
    window.PromptForm.bindEvents();
    window.SettingsAI?.bindEvents?.();
    window.ChainsUI?.bindEvents?.();

    await window.SettingsAI?.load?.();
    window.SettingsAI?.renderControls?.();
    await window.SettingsUI?.init?.();
    await window.SettingsAI?.syncSaveState?.();
    await bindSessionPayloadUpdates();

    try {
      const snapshot = await chrome.storage.local.get([KEYS.IMPROVE_PAYLOAD_KEY]);
      const promptiumImprovePayload = snapshot?.[KEYS.IMPROVE_PAYLOAD_KEY];
      const settingsSnap = (await chrome.storage.local.get([KEYS.SETTINGS_KEY]).catch(() => ({}))) as Record<string, any>;
      const activeProvider = String(settingsSnap?.[KEYS.SETTINGS_KEY]?.activeProvider || 'gemini')
        .trim()
        .toLowerCase();
      const providerKey = window.SessionStorage?.getStoredProviderKey
        ? await window.SessionStorage.getStoredProviderKey(activeProvider).catch(() => '')
        : await window.SessionStorage.getStoredGeminiKey().catch(() => '');

      if (promptiumImprovePayload) {
        await chrome.storage.local.remove([KEYS.IMPROVE_PAYLOAD_KEY]).catch(() => {});
        await loadRefinementFeature();
        const normalizedImprove = window.ImproveUI.normalizePayload(promptiumImprovePayload);
        if (normalizedImprove.text) {
          void window.ImproveUI.open(null, normalizedImprove.text, normalizedImprove.tags, {
            context: 'fab',
            sourceTabId: normalizedImprove.sourceTabId,
          });
        }
      }

      const keyInput = document.getElementById('pn-provider-key') as HTMLInputElement | null;
      if (keyInput && providerKey) keyInput.value = providerKey;
    } catch (_) {
      // non-fatal
    }

    const pendingPanelAction = (await consumePendingPanelAction()) as Record<string, unknown> | null;
    const hasSelectionPayload = Boolean(state.exportPayload?.messages?.length);
    const route = String(window.location.hash || '')
      .replace(/^#/, '')
      .trim()
      .toLowerCase();
    const routableTabs = new Set(['prompts', 'export', 'tags', 'settings', 'continue']);
    const initialTab = routableTabs.has(route)
      ? route
      : pendingPanelAction?.type === 'showExport'
        ? 'export'
        : pendingPanelAction?.type === 'showContinuation'
          ? 'continue'
          : hasSelectionPayload
            ? 'export'
            : 'prompts';
    await switchTab(initialTab);

    await window.PromptsUI.render('');
    await window.ChainsUI?.render?.('');
    await window.HistoryUI?.render?.();
    await window.TagsUI.render();
    await consumePendingSnippet();

    const onboardingInitializedAi = await maybeRunOnboarding();

    if (state.settings.enableAI) {
      if (!onboardingInitializedAi) {
        const embStatus = await window.SettingsAI?.syncAiState?.();
        state.aiReady = embStatus?.status === 'ready';
      }
    } else {
      await window.SettingsAI?.setAiDisabledBadge?.();
    }

    if (window.ExportPayloadUI) {
      if (state.exportSnapshotPayload?.messages?.length) {
        await window.ExportPayloadUI.setStatus('Selection loaded.');
      } else {
        await window.ExportPayloadUI.setStatus(
          'Select messages in chat, then click Export Selected.',
          false
        );
      }
    }

    state.initialized = true;
    await flushPendingActions();

    window.addEventListener('focus', () => {
      void consumePendingSnippet();
    });
  };

  window.AppShell = {
    switchTab,
    refreshHeaderControls,
  };

  window.SidepanelInit = {
    registerEarlyListeners,
    init,
  };

  registerEarlyListeners();

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((err) => {
      const banner = document.createElement('div');
      banner.className = 'pn-init-error-banner';
      banner.textContent = `Initialization failed: ${err?.message || 'Unknown error.'} Open Settings and retry.`;
      document.body.appendChild(banner);
    });
  });
})();
