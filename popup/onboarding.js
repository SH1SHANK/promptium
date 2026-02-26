/**
 * File: popup/onboarding.js
 * Purpose: Manages first-run onboarding cards, gesture navigation, personalization capture, and model setup flow.
 * Communicates with: popup/popup.js, utils/ai.js, chrome.storage.local.
 */

(() => {
  const ONBOARDING_KEY = 'onboardingComplete';
  const STEP_SEQUENCE = ['fetch', 'load', 'warmup', 'ready'];

  const CARDS = [
    {
      id: 'welcome',
      icon: '✦',
      headline: 'Meet PromptNest',
      subheadline: 'Your AI workflow, elevated.',
      body: 'Save prompts. Export conversations. Search by meaning. All on-device, all private.',
      accent: '#8b7cf6'
    },
    {
      id: 'prompts',
      icon: '⌘',
      headline: 'Never lose a great prompt',
      subheadline: 'Save once. Use everywhere.',
      body: 'Hit Save Prompt on any LLM. Your library syncs across ChatGPT, Claude, Gemini, Perplexity, and Copilot.',
      accent: '#6ee7b7'
    },
    {
      id: 'export',
      icon: '↑',
      headline: 'Export with intention',
      subheadline: 'Your conversations, your format.',
      body: 'Select specific messages. Customize fonts, backgrounds, and layout. Export as Markdown, TXT, or PDF — or send directly to another LLM.',
      accent: '#fbbf24'
    },
    {
      id: 'ai',
      icon: '◈',
      headline: 'AI that understands you',
      subheadline: 'Search by meaning, not keywords.',
      body: 'Type "help me study" and find prompts tagged "explain" or "quiz" — even without exact matches. Runs entirely on your device.',
      accent: '#f472b6'
    },
    {
      id: 'privacy',
      icon: '◉',
      headline: 'Zero data leaves your device',
      subheadline: 'No backend. No account. No tracking.',
      body: 'Every prompt, every export, every AI inference — fully local. Your conversations are yours.',
      accent: '#34d399'
    },
    {
      id: 'personalize',
      icon: '→',
      headline: 'One last thing',
      subheadline: 'Help us help you.',
      body: null,
      accent: '#8b7cf6',
      isPersonalize: true
    }
  ];

  const state = {
    currentCard: 0,
    totalCards: 6,
    userName: '',
    userContext: '',
    touchStartX: 0,
    touchStartY: 0,
    isDragging: false,
    dragOffset: 0
  };

  const dom = {
    mount: null,
    overlay: null,
    deck: null,
    cards: [],
    dots: [],
    swipeHint: null
  };

  let completionResolver = null;
  let hasModelInitRun = false;

  /** Pauses execution for the specified number of milliseconds. */
  const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Returns x and y pointer coordinates for touch or mouse input events. */
  const getPointer = async (event) => {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }

    if (event.changedTouches && event.changedTouches[0]) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }

    return { x: event.clientX, y: event.clientY };
  };

  /** Returns a card transform string for the current index relative to active card position. */
  const computeCardTransform = async (index) => {
    if (index < state.currentCard) {
      return 'translateX(-100%)';
    }

    if (index > state.currentCard) {
      return 'translateX(100%)';
    }

    return 'translateX(0)';
  };

  /** Replays staggered reveal animation on the active card after navigation. */
  const replayActiveAnimations = async () => {
    const card = dom.cards[state.currentCard];

    if (!card) {
      return;
    }

    card.classList.remove('pn-reveal');
    void card.offsetWidth;
    card.classList.add('pn-reveal');
  };

  /** Updates progress dots to reflect the currently active onboarding card. */
  const updateDots = async () => {
    dom.dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === state.currentCard);
    });
  };

  /** Applies card transform positions and active states for current onboarding index. */
  const updateCardPositions = async (withTransition = true) => {
    for (let index = 0; index < dom.cards.length; index += 1) {
      const card = dom.cards[index];
      card.classList.toggle('active', index === state.currentCard);
      card.classList.toggle('exited', index < state.currentCard);
      card.style.transition = withTransition ? 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
      card.style.transform = await computeCardTransform(index);
    }

    await updateDots();
    await replayActiveAnimations();
  };

  /** Applies live drag transforms to active and adjacent cards during swipe gestures. */
  const applyDragTransform = async (offset) => {
    const width = dom.deck?.clientWidth || 1;
    const current = dom.cards[state.currentCard];
    const previous = dom.cards[state.currentCard - 1];
    const next = dom.cards[state.currentCard + 1];

    if (current) {
      current.style.transform = `translateX(${offset}px)`;
    }

    if (previous) {
      previous.style.transform = `translateX(${offset - width}px)`;
    }

    if (next) {
      next.style.transform = `translateX(${offset + width}px)`;
    }
  };

  /** Animates cards back to stable positions when swipe threshold is not met. */
  const snapBack = async () => {
    await updateCardPositions(true);
  };

  /** Focuses personalization name input when the final card becomes active. */
  const focusPersonalizationInput = async () => {
    await sleep(340);
    document.getElementById('pn-user-name')?.focus();
  };

  /** Moves onboarding to the next card or completes personalization if on final card. */
  const nextCard = async () => {
    if (state.currentCard >= state.totalCards - 1) {
      await completePersonalization();
      return;
    }

    state.currentCard += 1;
    await updateCardPositions(true);

    if (state.currentCard === state.totalCards - 1) {
      await focusPersonalizationInput();
    }
  };

  /** Moves onboarding to the previous card when available. */
  const prevCard = async () => {
    if (state.currentCard <= 0) {
      return;
    }

    state.currentCard -= 1;
    await updateCardPositions(true);
  };

  /** Jumps directly to the personalize card from any earlier card. */
  const skipToPersonalize = async () => {
    state.currentCard = state.totalCards - 1;
    await updateCardPositions(true);
    await focusPersonalizationInput();
  };

  /** Starts drag state for touch and mouse interactions over onboarding cards. */
  const onDragStart = async (event) => {
    if (!dom.deck) {
      return;
    }

    const targetTag = String(event.target?.tagName || '').toLowerCase();

    if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'button' || targetTag === 'a') {
      return;
    }

    const pointer = await getPointer(event);
    state.touchStartX = pointer.x;
    state.touchStartY = pointer.y;
    state.isDragging = true;
    state.dragOffset = 0;

    [dom.cards[state.currentCard - 1], dom.cards[state.currentCard], dom.cards[state.currentCard + 1]]
      .filter(Boolean)
      .forEach((card) => {
        card.style.transition = 'none';
      });
  };

  /** Updates drag offset with edge resistance and applies live card movement transforms. */
  const onDragMove = async (event) => {
    if (!state.isDragging) {
      return;
    }

    const pointer = await getPointer(event);
    const deltaX = pointer.x - state.touchStartX;
    const deltaY = Math.abs(pointer.y - state.touchStartY);

    if (deltaY > Math.abs(deltaX)) {
      return;
    }

    state.dragOffset = deltaX;

    const resistance = state.currentCard === 0 && deltaX > 0
      ? 0.3
      : state.currentCard === state.totalCards - 1 && deltaX < 0
        ? 0.3
        : 1;

    await applyDragTransform(deltaX * resistance);

    if (event.cancelable) {
      event.preventDefault();
    }
  };

  /** Ends drag gesture and triggers card navigation or snap-back based on threshold. */
  const onDragEnd = async () => {
    if (!state.isDragging) {
      return;
    }

    const threshold = 60;

    if (Math.abs(state.dragOffset) > threshold) {
      if (state.dragOffset > 0) {
        await prevCard();
      } else {
        await nextCard();
      }
    } else {
      await snapBack();
    }

    state.isDragging = false;
    state.dragOffset = 0;
  };

  /** Marks initialization steps as active/done according to the current stage id. */
  const markStep = async (stepId) => {
    const activeIndex = STEP_SEQUENCE.indexOf(stepId);

    document.querySelectorAll('.pn-step').forEach((node) => {
      const nodeIndex = STEP_SEQUENCE.indexOf(String(node.dataset.step || ''));
      node.classList.remove('active');
      node.classList.remove('done');

      if (nodeIndex < activeIndex) {
        node.classList.add('done');
      }

      if (nodeIndex === activeIndex) {
        node.classList.add('active');
      }
    });
  };

  /** Marks all initialization steps complete after successful model setup. */
  const markAllStepsDone = async () => {
    document.querySelectorAll('.pn-step').forEach((node) => {
      node.classList.remove('active');
      node.classList.add('done');
    });
  };

  /** Finalizes onboarding, saves completion flag, removes overlay, and resumes popup boot flow. */
  const completeOnboarding = async () => {
    await chrome.storage.local.set({ [ONBOARDING_KEY]: true });

    const overlay = dom.overlay || document.getElementById('pn-onboarding');

    if (overlay) {
      overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      overlay.style.opacity = '0';
      overlay.style.transform = 'scale(0.97)';
      await sleep(400);
      overlay.remove();
    }

    const headerTitle = document.querySelector('.pn-header-title, .pn-title');
    const { userName } = await chrome.storage.local.get(['userName']);
    const name = String(userName || '').trim();

    if (name && headerTitle) {
      headerTitle.textContent = `Hi, ${name} ✦`;
      await sleep(2000);
      headerTitle.textContent = 'PromptNest';
    }

    if (typeof completionResolver === 'function') {
      await completionResolver({ aiInitialized: hasModelInitRun });
    }
  };

  /** Runs staged setup progress animation and initializes smart features once. */
  const runModelInit = async () => {
    const bar = document.getElementById('pn-progress-bar');
    const label = document.getElementById('pn-progress-label');
    const pct = document.getElementById('pn-progress-pct');

    const steps = [
      { pct: 15, label: 'Preparing smart search...', step: 'fetch', delay: 400 },
      { pct: 45, label: 'Initializing runtime...', step: 'fetch', delay: 1200 },
      { pct: 70, label: 'Applying preferences...', step: 'load', delay: 800 },
      { pct: 85, label: 'Warming up suggestions...', step: 'warmup', delay: 600 },
      { pct: 95, label: 'Personalizing...', step: 'warmup', delay: 400 }
    ];

    for (const item of steps) {
      await sleep(item.delay);

      if (bar) {
        bar.style.width = `${item.pct}%`;
      }

      if (label) {
        label.textContent = item.label;
      }

      if (pct) {
        pct.textContent = `${item.pct}%`;
      }

      await markStep(item.step);
    }

    try {
      hasModelInitRun = true;
      const ready = await window.AI.initModel();

      if (!ready) {
        throw new Error('AI unavailable');
      }

      await sleep(300);

      if (bar) {
        bar.style.width = '100%';
      }

      if (pct) {
        pct.textContent = '100%';
      }

      if (label) {
        label.textContent = 'Ready.';
      }

      await markStep('ready');
      await markAllStepsDone();
      await sleep(600);
      await completeOnboarding();
    } catch (_error) {
      if (label) {
        label.textContent = 'AI unavailable — continuing without it.';
      }

      if (pct) {
        pct.textContent = '';
      }

      await sleep(1500);
      await completeOnboarding();
    }
  };

  /** Replaces card deck with the smart-feature initialization interface in the same overlay. */
  const showModelInitScreen = async () => {
    const overlay = dom.overlay || document.getElementById('pn-onboarding');

    if (!overlay) {
      return;
    }

    overlay.classList.add('pn-model-mode');
    overlay.innerHTML = `
      <div id="pn-model-init">
        <div class="pn-init-header">
          <div class="pn-init-icon">◈</div>
          <h2>Setting up smart features</h2>
          <p>PromptNest runs model-free smart ranking and tagging.<br>No model download is required.</p>
        </div>

        <div class="pn-progress-container">
          <div class="pn-progress-track">
            <div id="pn-progress-bar" class="pn-progress-fill"></div>
          </div>
          <div class="pn-progress-meta">
            <span id="pn-progress-label">Initializing...</span>
            <span id="pn-progress-pct">0%</span>
          </div>
        </div>

        <div id="pn-init-steps" class="pn-init-steps">
          <div class="pn-step" data-step="fetch">
            <span class="pn-step-dot"></span>
            <span class="pn-step-text">Preparing runtime</span>
          </div>
          <div class="pn-step" data-step="load">
            <span class="pn-step-dot"></span>
            <span class="pn-step-text">Applying preferences</span>
          </div>
          <div class="pn-step" data-step="warmup">
            <span class="pn-step-dot"></span>
            <span class="pn-step-text">Warming up ranking</span>
          </div>
          <div class="pn-step" data-step="ready">
            <span class="pn-step-dot"></span>
            <span class="pn-step-text">Personalizing tag engine</span>
          </div>
        </div>
      </div>
    `;

    await runModelInit();
  };

  /** Saves user personalization inputs and transitions into model setup screen. */
  const completePersonalization = async () => {
    const nameInput = document.getElementById('pn-user-name');
    const contextInput = document.getElementById('pn-user-context');
    state.userName = String(nameInput?.value || '').trim();
    state.userContext = String(contextInput?.value || '').trim();

    await chrome.storage.local.set({
      userName: state.userName,
      userContext: state.userContext
    });

    await showModelInitScreen();
  };

  /** Returns markup for the personalize card input controls and helper text. */
  const renderPersonalizeCard = async () => `
    <div class="pn-onboard-inputs">
      <div class="pn-input-group">
        <label>What should we call you?</label>
        <input type="text" id="pn-user-name" placeholder="Your name" maxlength="32" autocomplete="off">
      </div>
      <div class="pn-input-group">
        <label>What do you mainly use LLMs for?</label>
        <textarea id="pn-user-context" placeholder="e.g. coding, studying, research, writing..." maxlength="120" rows="2"></textarea>
      </div>
      <p class="pn-input-hint">This helps generate better tag suggestions for your prompts.</p>
    </div>
  `;

  /** Builds one onboarding card element with text, optional inputs, and actions. */
  const renderCard = async (card, index) => {
    const node = document.createElement('section');
    node.className = 'pn-onboard-card';
    node.dataset.index = String(index);
    node.dataset.cardId = card.id;
    node.innerHTML = `
      <span class="pn-card-icon" style="color: ${card.accent};">${card.icon}</span>
      <p class="pn-card-sub">${card.subheadline}</p>
      <h2 class="pn-card-headline">${card.headline}</h2>
      ${card.isPersonalize ? await renderPersonalizeCard() : `<p class="pn-card-body">${card.body}</p>`}
      ${card.id === 'welcome' ? '<p class="pn-swipe-hint">swipe or continue →</p>' : ''}
      <div class="pn-onboard-actions">
        <button class="pn-onboard-btn" type="button" data-action="continue">${card.isPersonalize ? 'Set Up AI →' : 'Continue'}</button>
        ${card.isPersonalize ? '' : '<a class="pn-onboard-skip" href="#" data-action="skip">Skip</a>'}
      </div>
    `;

    return node;
  };

  /** Handles overlay click actions for continue and skip controls. */
  const onOverlayClick = async (event) => {
    const action = String(event.target?.dataset?.action || '');

    if (action === 'continue') {
      event.preventDefault();
      await nextCard();
      return;
    }

    if (action === 'skip') {
      event.preventDefault();
      await skipToPersonalize();
    }
  };

  /** Registers onboarding click and drag event listeners for touch and mouse input. */
  const bindEvents = async () => {
    if (!dom.overlay || !dom.deck) {
      return;
    }

    dom.overlay.addEventListener('click', (event) => {
      void onOverlayClick(event);
    });

    dom.deck.addEventListener('touchstart', (event) => {
      void onDragStart(event);
    }, { passive: true });

    dom.deck.addEventListener('touchmove', (event) => {
      void onDragMove(event);
    }, { passive: false });

    dom.deck.addEventListener('touchend', () => {
      void onDragEnd();
    });

    dom.deck.addEventListener('mousedown', (event) => {
      void onDragStart(event);
    });

    window.addEventListener('mousemove', (event) => {
      void onDragMove(event);
    });

    window.addEventListener('mouseup', () => {
      void onDragEnd();
    });
  };

  /** Renders onboarding overlay, card deck, navigation dots, and initial reveal state. */
  const renderOnboarding = async () => {
    dom.mount = document.getElementById('pn-onboarding-mount') || document.body;
    dom.overlay = document.createElement('div');
    dom.overlay.id = 'pn-onboarding';
    dom.overlay.innerHTML = `
      <div class="pn-card-deck"></div>
      <div class="pn-dot-row"></div>
    `;

    dom.mount.appendChild(dom.overlay);
    dom.deck = dom.overlay.querySelector('.pn-card-deck');
    const dotsRow = dom.overlay.querySelector('.pn-dot-row');

    dom.cards = [];
    dom.dots = [];

    for (let index = 0; index < CARDS.length; index += 1) {
      const cardNode = await renderCard(CARDS[index], index);
      dom.cards.push(cardNode);
      dom.deck.appendChild(cardNode);

      const dot = document.createElement('span');
      dot.className = 'pn-dot';
      dotsRow.appendChild(dot);
      dom.dots.push(dot);
    }

    dom.swipeHint = dom.overlay.querySelector('.pn-swipe-hint');

    await updateCardPositions(false);
    await bindEvents();

    if (dom.swipeHint) {
      setTimeout(() => {
        dom.swipeHint.classList.add('pn-hint-hidden');
      }, 3000);
    }
  };

  /** Starts onboarding flow from card zero and binds completion callback for popup boot continuation. */
  const start = async ({ onComplete } = {}) => {
    state.currentCard = 0;
    state.totalCards = CARDS.length;
    state.userName = '';
    state.userContext = '';
    state.touchStartX = 0;
    state.touchStartY = 0;
    state.isDragging = false;
    state.dragOffset = 0;
    hasModelInitRun = false;
    completionResolver = typeof onComplete === 'function' ? onComplete : null;

    const existing = document.getElementById('pn-onboarding');

    if (existing) {
      existing.remove();
    }

    await renderOnboarding();
  };

  window.Onboarding = {
    CARDS,
    state,
    start,
    renderOnboarding,
    renderCard,
    completeOnboarding
  };
})();
