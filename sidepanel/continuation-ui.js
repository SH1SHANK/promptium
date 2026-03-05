(() => {
/**
 * File: sidepanel/continuation-ui.js
 * Purpose: Continue Chat view orchestration for sidepanel and export-triggered continuation.
 */

const { state } = window.SidepanelState;

const localState = {
  payload: null,
  busy: false,
  advisory: ''
};

const normalizeMessages = (messages) => (Array.isArray(messages) ? messages : [])
  .map((message) => ({
    role: String(message?.role || 'assistant').trim().toLowerCase(),
    text: String(message?.text || '').trim()
  }))
  .filter((message) => message.text.length > 0);

const getEnabledPlatformMap = () => {
  const defaults = {
    chatgpt: true,
    claude: true,
    gemini: true,
    perplexity: true,
    copilot: true
  };
  const source = state.settings?.enabledPlatforms && typeof state.settings.enabledPlatforms === 'object'
    ? state.settings.enabledPlatforms
    : {};
  return { ...defaults, ...source };
};

const getEligibleTargets = (sourcePlatform = '') => {
  const bridgeUrls = window.Bridge?.LLM_URLS || {};
  const enabledMap = getEnabledPlatformMap();
  const all = Object.keys(bridgeUrls).filter((platform) => enabledMap[platform] !== false);

  if (!all.length) {
    return [];
  }

  const source = String(sourcePlatform || '').toLowerCase().trim();
  if (!source || !all.includes(source)) {
    return all;
  }

  return [source, ...all.filter((platform) => platform !== source)];
};

const setBusy = (busy) => {
  localState.busy = Boolean(busy);
  const run = byId('pn-continue-run');
  const cancel = byId('pn-continue-cancel');
  const summary = byId('pn-continue-summary');
  if (run) {
    run.disabled = localState.busy;
    run.textContent = localState.busy ? 'Building handoff...' : 'Continue →';
  }
  if (cancel) {
    cancel.disabled = localState.busy;
  }
  if (summary) {
    summary.classList.toggle('pn-loading-state', localState.busy);
    if (localState.busy) {
      summary.textContent = 'Generating continuation summary…';
    } else {
      renderSummary();
    }
  }
};

const setAdvisory = (value = '') => {
  localState.advisory = String(value || '').trim();
  const node = byId('pn-continue-advisory');
  if (!node) return;
  node.textContent = localState.advisory;
  node.classList.toggle('pn-hidden', !localState.advisory);
};

const renderSummary = () => {
  const summary = byId('pn-continue-summary');
  if (!summary) return;

  const payload = localState.payload;
  const messages = normalizeMessages(payload?.messages);

  if (!messages.length) {
    summary.textContent = 'No conversation loaded yet.';
    setAdvisory('');
    return;
  }

  const preview = messages
    .slice(-2)
    .map((message) => `${message.role === 'user' ? 'You' : 'Assistant'}: ${message.text}`)
    .join('\n')
    .slice(0, 320);

  const platform = window.PLATFORM_LABELS?.[payload?.platform] || String(payload?.platform || 'Unknown');
  summary.textContent = `${messages.length} messages from ${platform}\n\n${preview}`;
};

const renderTargetOptions = () => {
  const select = byId('pn-continue-target');
  if (!select) return;

  const sourcePlatform = String(localState.payload?.platform || '').toLowerCase();
  const targets = getEligibleTargets(sourcePlatform);

  select.innerHTML = '';
  if (!targets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No enabled targets';
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  targets.forEach((platform) => {
    const option = document.createElement('option');
    option.value = platform;
    option.textContent = window.PLATFORM_LABELS?.[platform] || platform;
    select.appendChild(option);
  });

  select.disabled = false;
  select.value = targets[0];
};

const syncDefaults = () => {
  const mode = byId('pn-continue-mode');
  const note = byId('pn-continue-note');
  if (mode) {
    const preferred = String(state.settings?.continueDefaultMode || 'FULL_SUMMARY').trim().toUpperCase();
    mode.value = ['FULL_SUMMARY', 'KEY_POINTS', 'RECENT_ONLY'].includes(preferred) ? preferred : 'FULL_SUMMARY';
  }
  if (note) {
    note.value = '';
  }
};

const loadFromActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return null;
  }

  const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeForContinuation' }).catch(() => null);
  const messages = normalizeMessages(response?.messages);
  if (!messages.length) {
    return null;
  }

  return {
    platform: String(response?.platform || '').toLowerCase(),
    url: String(tab.url || ''),
    messages
  };
};

const openFromPayload = async (payload) => {
  const messages = normalizeMessages(payload?.messages);
  localState.payload = {
    platform: String(payload?.platform || '').toLowerCase(),
    url: String(payload?.url || ''),
    messages
  };

  renderSummary();
  setAdvisory('');
  renderTargetOptions();
  syncDefaults();
  if (window.AppShell?.switchTab) {
    await window.AppShell.switchTab('continue');
  }
};

const openFromActiveTab = async () => {
  const payload = await loadFromActiveTab();
  if (!payload) {
    await showToast('No conversation found to continue.');
    return false;
  }
  await openFromPayload(payload);
  return true;
};

const openFromExportSelection = async () => {
  const exportPayload = window.ExportPayloadUI?.getActivePayload?.();
  if (Array.isArray(exportPayload?.messages) && exportPayload.messages.length > 0) {
    await openFromPayload(exportPayload);
    return true;
  }
  return openFromActiveTab();
};

const runContinuation = async () => {
  if (localState.busy) {
    return;
  }

  let payload = localState.payload;
  if (!payload?.messages?.length) {
    payload = await loadFromActiveTab();
    if (!payload) {
      await showToast('No conversation found to continue.');
      return;
    }
    localState.payload = payload;
    renderSummary();
    renderTargetOptions();
  }

  const targetNode = byId('pn-continue-target');
  const modeNode = byId('pn-continue-mode');
  const noteNode = byId('pn-continue-note');
  const target = String(targetNode?.value || '').trim().toLowerCase();
  const mode = String(modeNode?.value || 'FULL_SUMMARY').trim();
  const note = String(noteNode?.value || '').trim();

  if (!target) {
    await showToast('Select a target platform.');
    return;
  }

  const llmUrl = window.Bridge?.LLM_URLS?.[target];
  if (!llmUrl) {
    await showToast('Unsupported continuation target.');
    return;
  }

  setBusy(true);
  setAdvisory('');
  try {
    const handoff = await window.Continuation.buildHandoff(payload.messages, mode, note);
    if (handoff && typeof handoff === 'object' && handoff.ok === false) {
      if (handoff.error === 'no_ai_available') {
        throw new Error('No AI backend available for long continuation summary.');
      }
      throw new Error(handoff.error || 'Could not build continuation handoff.');
    }
    const handoffText = typeof handoff === 'string' ? handoff : String(handoff?.text || '').trim();
    if (!handoffText) {
      throw new Error('Could not build continuation handoff.');
    }
    if (typeof handoff === 'object' && handoff?.advisory) setAdvisory(handoff.advisory);

    await window.Continuation.store(handoffText, target, payload.platform);

    const opened = await chrome.runtime.sendMessage({ action: 'openLlmTab', url: llmUrl }).catch(() => null);
    if (!opened?.ok) {
      throw new Error(opened?.error || 'Could not open target platform.');
    }

    await showToast(`Opening ${window.PLATFORM_LABELS?.[target] || target}...`);
    if (window.AppShell?.switchTab) {
      await window.AppShell.switchTab('prompts');
    }
  } catch (error) {
    await showToast(error?.message || 'Continue Chat failed.');
  } finally {
    setBusy(false);
  }
};

const bindEvents = () => {
  byId('pn-open-continue-chat')?.addEventListener('click', () => {
    void openFromExportSelection();
  });

  byId('pn-continue-run')?.addEventListener('click', () => {
    void runContinuation();
  });

  byId('pn-continue-cancel')?.addEventListener('click', () => {
    if (window.AppShell?.switchTab) {
      void window.AppShell.switchTab('prompts');
    }
  });
};

window.ContinuationUI = {
  openFromPayload,
  openFromActiveTab,
  openFromExportSelection,
  bindEvents,
  runContinuation
};
})();
