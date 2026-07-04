// File: src/prompt/builder/builder.ts
import { Prompt, VariableConfig } from '../types/types';
import { PromptStore } from '../storage/storage';
import { PromptVersionStore, PromptVersion } from '../versions/versions';
import { VariablesManager } from '../variables/variables';
import { PromptDiagnostics } from '../diagnostics/diagnostics';
import { SimilarityEngine } from '../search/similarity';
import { BuilderDOM } from './builder-dom';
import { BuilderActions } from './builder-actions';
import { PnDialog } from '../shared/dialog';

let activePromptId: string | null = null;
let activeMode: 'plain' | 'template' = 'plain';
let activeVariablesConfig: VariableConfig[] = [];
let playgroundValues: Record<string, string> = {};
let categoriesList: Array<{ id: string; name: string; color: string }> = [];

let isDirty = false;
let lastSavedTime = 0;
let autosaveTimer: any = null;
let saveStatusInterval: any = null;
let activePreviewSubtab: 'rendered' | 'raw' = 'rendered';

const callbacks = {
  onPromptSaved: null as (() => void) | null,
  onOpenImprove: null as ((promptId: string, text: string, tags: string[]) => void) | null,
};

const CATEGORY_COLORS: Record<string, string> = {
  writing: '#3B82F6',
  coding: '#10B981',
  study: '#F59E0B',
  research: '#8B5CF6',
  creative: '#EC4899',
  work: '#6B7280',
  general: '#6366F1',
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatShortDate = (isoString: string | null): string => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (_) {
    return '';
  }
};

const renderLineDiff = (oldText: string, newText: string): string => {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let html = '';
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        html += `<div class="diff-line diff-line--unchanged">  ${escapeHtml(oldLine)}</div>`;
      }
    } else {
      if (oldLine !== undefined) {
        html += `<div class="diff-line diff-line--removed">- ${escapeHtml(oldLine)}</div>`;
      }
      if (newLine !== undefined) {
        html += `<div class="diff-line diff-line--added">+ ${escapeHtml(newLine)}</div>`;
      }
    }
  }
  return html;
};

const GENERIC_TITLES = new Set([
  '',
  'untitled',
  'untitled prompt',
  'new prompt',
  'draft',
  'new template',
  'untitled template',
]);

let cleanContentHash = '';

const getContentHash = (): string => {
  const title = BuilderDOM.titleInput?.value || '';
  const description = BuilderDOM.descInput?.value || '';
  const category = BuilderDOM.categorySelect?.value || 'general';
  const text = BuilderDOM.textarea?.value || '';
  const favorite = BuilderDOM.favoriteInput?.checked ? '1' : '0';
  const pinned = BuilderDOM.pinnedInput?.checked ? '1' : '0';
  const tags = BuilderDOM.tagsHidden?.value || '';
  return `${title}::${description}::${category}::${favorite}::${pinned}::${tags}::${text}`;
};

const checkDirtyState = (): boolean => {
  const currentHash = getContentHash();
  isDirty = currentHash !== cleanContentHash;
  return isDirty;
};

export const PromptForm = {
  diagnosticsFrameId: null as number | null,

  setCallbacks(nextCallbacks: any = {}): void {
    callbacks.onPromptSaved = nextCallbacks.onPromptSaved || null;
    callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
  },

  triggerDiagnostics(): void {
    if (this.diagnosticsFrameId !== null) {
      cancelAnimationFrame(this.diagnosticsFrameId);
    }
    this.diagnosticsFrameId = requestAnimationFrame(() => {
      this.diagnosticsFrameId = null;
      this.runDiagnostics();
    });
  },

  runDiagnostics(): void {
    const textEl = BuilderDOM.textarea;
    const titleEl = BuilderDOM.titleInput;
    const descEl = BuilderDOM.descInput;
    const tagsHidden = BuilderDOM.tagsHidden;

    if (!textEl || !titleEl) return;

    const text = textEl.value;
    const title = titleEl.value;
    const description = descEl?.value || '';
    const tags = tagsHidden?.value ? tagsHidden.value.split(',').filter(Boolean) : [];

    const result = PromptDiagnostics.run(title, text, tags, description, activeVariablesConfig);

    // 1. Update Diagnostics Tab button count text
    const tabBtn = BuilderDOM.tabDiagnostics;
    if (tabBtn) {
      tabBtn.textContent = `Diagnostics (${result.issues.length})`;
      if (result.issues.some((issue: any) => issue.severity === 'error')) {
        tabBtn.style.color = 'var(--color-danger-soft)';
      } else if (result.issues.some((issue: any) => issue.severity === 'warning')) {
        tabBtn.style.color = 'var(--color-warning)';
      } else {
        tabBtn.style.color = '';
      }
    }

    // 2. Render issues inside diagnostics container pane
    const container = BuilderDOM.diagnostics;
    if (container) {
      container.innerHTML = '';
      if (result.issues.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="border: 1px dashed var(--color-border-default); padding: var(--space-4); text-align: center; border-radius: var(--radius-md); width: 100%; box-sizing: border-box;">
            <p class="empty-state__title" style="margin: 0; font-size: var(--font-size-md); color: var(--color-success-soft); font-weight: 600;">✓ All checks passed</p>
            <p class="empty-state__message" style="margin: var(--space-1) 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Your prompt meets all quality and styling guidelines.</p>
          </div>
        `;
      } else {
        result.issues.forEach((issue: any) => {
          const div = document.createElement('div');
          div.style.display = 'flex';
          div.style.alignItems = 'flex-start';
          div.style.gap = 'var(--space-2)';
          div.style.padding = 'var(--space-2) var(--space-3)';
          div.style.borderRadius = 'var(--radius-xs)';
          div.style.fontSize = 'var(--font-size-sm)';

          let icon = 'ℹ';
          let bg = 'rgba(255, 255, 255, 0.02)';
          let color = 'var(--color-text-secondary)';
          if (issue.severity === 'error') {
            icon = '🛑';
            bg = 'rgba(239, 68, 68, 0.1)';
            color = 'var(--color-danger-soft)';
          } else if (issue.severity === 'warning') {
            icon = '⚠';
            bg = 'rgba(245, 158, 11, 0.1)';
            color = 'var(--color-warning)';
          }

          div.style.background = bg;
          div.style.color = color;
          div.innerHTML = `<span style="font-size: 1.1em; line-height: 1;">${icon}</span><span style="flex: 1;">${escapeHtml(issue.message)}</span>`;
          container.appendChild(div);
        });
      }
    }

    // 3. Update Health Score Pill
    const healthEl = BuilderDOM.healthScore;
    if (healthEl) {
      healthEl.textContent = `Health: ${result.score}/100`;
      if (result.score >= 80) {
        healthEl.style.background = 'rgba(16, 185, 129, 0.15)';
        healthEl.style.color = 'var(--color-success-soft)';
      } else if (result.score >= 50) {
        healthEl.style.background = 'rgba(245, 158, 11, 0.15)';
        healthEl.style.color = 'var(--color-warning)';
      } else {
        healthEl.style.background = 'rgba(239, 68, 68, 0.15)';
        healthEl.style.color = 'var(--color-danger-soft)';
      }
    }

    // 4. Suggest Title Button Toggle
    const suggestBtn = BuilderDOM.suggestTitleBtn;
    if (suggestBtn) {
      const cleanTitle = title.trim().toLowerCase();
      const isGeneric = !cleanTitle || GENERIC_TITLES.has(cleanTitle);
      if (isGeneric && text.trim().length > 5) {
        suggestBtn.classList.remove('hidden');
      } else {
        suggestBtn.classList.add('hidden');
      }
    }
  },

  async open(
    options: {
      id?: string;
      mode?: 'plain' | 'template';
      text?: string;
      description?: string;
      prompt?: Prompt;
    } = {}
  ): Promise<void> {
    const modal = BuilderDOM.promptBuilder;
    if (!modal) return;

    if (
      activePromptId &&
      activePromptId === (options.prompt?.id || options.id) &&
      !modal.classList.contains('hidden')
    ) {
      const textEl = BuilderDOM.textarea;
      textEl?.focus();
      return;
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    const prompt = options.prompt || null;
    activePromptId = prompt ? prompt.id : options.id || null;
    activeMode = prompt ? (prompt.isTemplate ? 'template' : 'plain') : options.mode || 'plain';
    activeVariablesConfig = prompt ? prompt.variables || [] : [];
    playgroundValues = {};
    isDirty = false;
    lastSavedTime = 0;

    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (saveStatusInterval) clearInterval(saveStatusInterval);

    const textEl = BuilderDOM.textarea;
    const titleEl = BuilderDOM.titleInput;
    const descEl = BuilderDOM.descInput;
    const catEl = BuilderDOM.categorySelect;
    const tagsInput = BuilderDOM.tagsInput;
    const favEl = BuilderDOM.favoriteInput;
    const pinEl = BuilderDOM.pinnedInput;
    const tagsHidden = BuilderDOM.tagsHidden;

    if (textEl) textEl.value = prompt ? prompt.text || '' : options.text || '';
    if (titleEl) titleEl.value = prompt ? prompt.title || '' : '';
    if (descEl) descEl.value = prompt ? prompt.description || '' : options.description || '';
    if (catEl) catEl.value = prompt ? prompt.category || 'general' : 'general';
    if (tagsInput) tagsInput.value = '';
    if (tagsHidden) tagsHidden.value = prompt ? (prompt.tags || []).join(',') : '';

    const badgesWrap = BuilderDOM.tagsContainer;
    if (badgesWrap) {
      badgesWrap.querySelectorAll('.tag-badge').forEach((b) => b.remove());
      const initialTags = prompt ? prompt.tags || [] : [];
      initialTags.forEach((tag: string) => {
        const badge = document.createElement('span');
        badge.className = 'tag-badge';
        badge.innerHTML = `${escapeHtml(tag)}<span class="tag-badge-close">&times;</span>`;
        badge.querySelector('.tag-badge-close')?.addEventListener('click', () => {
          badge.remove();
          this.syncTagsInput();
        });
        badgesWrap.insertBefore(badge, tagsInput);
      });
    }

    this.updateModeButtons();
    await this.loadCategoriesList();

    const sessionKey = activePromptId
      ? `active_draft_session_${activePromptId}`
      : 'active_draft_session_new';
    await chrome.storage.local.set({ active_draft_session_id: sessionKey });

    let hasDraft = false;
    const prefilledSnap = await chrome.storage.local.get(['pn_prefilled_draft']);
    if (prefilledSnap && prefilledSnap.pn_prefilled_draft) {
      const draft = prefilledSnap.pn_prefilled_draft as any;
      await chrome.storage.local.remove(['pn_prefilled_draft']);
      if (textEl) textEl.value = draft.text || '';

      const mode = draft.mode;
      if (mode === 'fix') {
        if (titleEl) titleEl.value = 'Fix Snippet';
        if (descEl) descEl.value = draft.description || 'Fix grammar and clarity';
        if (catEl) catEl.value = 'writing';
      } else if (mode === 'upgrade') {
        if (titleEl) titleEl.value = 'Upgrade Snippet';
        if (descEl) descEl.value = draft.description || 'Upgrade prompt intelligence';
        if (catEl) catEl.value = 'creative';
      } else if (mode === 'rewrite') {
        if (titleEl) titleEl.value = 'Rewrite Snippet';
        if (descEl) descEl.value = draft.description || 'Rewrite text';
        if (catEl) catEl.value = 'writing';
      } else {
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = draft.description || '';
      }

      isDirty = true;
      lastSavedTime = Date.now();
      this.updateStatusText('Draft saved');
      this.triggerAutosave();
      hasDraft = true;
    } else {
      const cacheKey = `temporary_draft_${activePromptId || 'new'}`;
      const cached = await chrome.storage.local.get([cacheKey]);
      if (cached && cached[cacheKey]) {
        const draft = cached[cacheKey] as any;
        if (titleEl) titleEl.value = draft.title || '';
        if (descEl) descEl.value = draft.description || '';
        if (textEl) textEl.value = draft.text || '';
        if (catEl) catEl.value = draft.category || 'general';
        if (favEl) favEl.checked = Boolean(draft.isFavorite);
        if (pinEl) pinEl.checked = Boolean(draft.isPinned);
        activeVariablesConfig = draft.variables || [];
        playgroundValues = draft.playgroundValues || {};

        if (badgesWrap) {
          badgesWrap.querySelectorAll('.tag-badge').forEach((b) => b.remove());
          (draft.tags || []).forEach((tag: string) => {
            const badge = document.createElement('span');
            badge.className = 'tag-badge';
            badge.innerHTML = `${escapeHtml(tag)}<span class="tag-badge-close">&times;</span>`;
            badge.querySelector('.tag-badge-close')?.addEventListener('click', () => {
              badge.remove();
              this.syncTagsInput();
            });
            badgesWrap.insertBefore(badge, tagsInput);
          });
        }
        isDirty = true;
        lastSavedTime = draft.timestamp || Date.now();
        this.updateStatusText('Draft saved');
        if (
          textEl &&
          typeof draft.selectionStart === 'number' &&
          typeof draft.selectionEnd === 'number'
        ) {
          setTimeout(() => {
            textEl.setSelectionRange(draft.selectionStart, draft.selectionEnd);
          }, 0);
        }
        hasDraft = true;
      }
    }

    if (!hasDraft) {
      if (prompt) {
        isDirty = false;
        this.updateStatusText('');
      } else {
        isDirty = options.text || options.description ? true : false;
        if (isDirty) {
          this.triggerAutosave();
        } else {
          this.updateStatusText('');
        }
      }
    }

    cleanContentHash = getContentHash();

    this.updateEditorHighlights();
    this.syncStats();
    this.detectAndSyncVariables();

    const tabsContainer = BuilderDOM.workspace;
    tabsContainer?.classList.add('collapsed');
    BuilderDOM.root.querySelectorAll('.builder-workspace-tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    BuilderDOM.root
      .querySelectorAll('.builder-workspace-tab-pane')
      .forEach((p) => p.classList.remove('active'));

    activePreviewSubtab = 'rendered';
    this.switchSubtab('rendered');

    BuilderDOM.duplicateBanner?.classList.add('hidden');
    this.runDiagnostics();

    requestAnimationFrame(() => {
      if (titleEl && !titleEl.value) {
        titleEl.focus();
      } else {
        textEl?.focus();
      }
    });
  },

  async openForEdit(prompt: Prompt): Promise<void> {
    await this.open({ prompt });
  },

  async openPlainPrefilled(text: string, sourceUrl = ''): Promise<void> {
    await this.open({
      mode: 'plain',
      text: text,
      description: sourceUrl ? `Saved from ${sourceUrl}` : '',
    });
  },

  close(): void {
    if (getContentHash() !== cleanContentHash) {
      this.showUnsavedChangesDialog();
    } else {
      this.forceClose();
    }
  },

  forceClose(): void {
    const modal = BuilderDOM.promptBuilder;
    if (modal) {
      modal.classList.add('hidden');
    }
    document.body.classList.remove('modal-open');
    // Clear temporary drafts on complete exit/close
    const cacheKey = `temporary_draft_${activePromptId || 'new'}`;
    void chrome.storage.local.remove([cacheKey, 'active_draft_session_id']);

    activePromptId = null;
    isDirty = false;
    activeVariablesConfig = [];
    playgroundValues = {};
    activeMode = 'plain';
    cleanContentHash = '';
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (saveStatusInterval) clearInterval(saveStatusInterval);
  },

  showUnsavedChangesDialog(): void {
    const dialog = BuilderDOM.unsavedDialog;
    if (dialog) dialog.classList.remove('hidden');
  },

  hideUnsavedChangesDialog(): void {
    const dialog = BuilderDOM.unsavedDialog;
    if (dialog) dialog.classList.add('hidden');
  },

  updateModeButtons(): void {
    const plainBtn = BuilderDOM.modePlain;
    const templateBtn = BuilderDOM.modeTemplate;
    if (activeMode === 'plain') {
      plainBtn?.classList.add('active');
      templateBtn?.classList.remove('active');
    } else {
      plainBtn?.classList.remove('active');
      templateBtn?.classList.add('active');
    }
  },

  updateEditorHighlights(): void {
    const textarea = BuilderDOM.textarea;
    const backdrop = BuilderDOM.editorBackdrop;
    if (!textarea || !backdrop) return;

    requestAnimationFrame(() => {
      const val = textarea.value;
      let html = escapeHtml(val);

      // Highlight variables: {{variable}}
      html = html.replace(/(\{\{[\s\S]*?\}\})/g, '<span class="editor-var-highlight">$1</span>');

      // Highlight markdown headings: # Heading
      html = html.replace(/^(#+ .*$)/gim, '<span class="editor-heading-highlight">$1</span>');

      // Highlight fenced code blocks: ```code```
      html = html.replace(/(```[\s\S]*?```)/g, '<span class="editor-code-highlight">$1</span>');

      backdrop.innerHTML = html + '\n';

      // Mirror scroll positions
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    });
  },

  syncStats(): void {
    const textarea = BuilderDOM.textarea;
    if (!textarea) return;

    const text = textarea.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    // Token count estimate
    const TokenCounter = (window as any).TokenCounter;
    const provider = 'gemini';
    const tokens = TokenCounter ? TokenCounter.count(text, provider).count : 0;
    const variablesCount = activeVariablesConfig.length;

    const statsEl = BuilderDOM.statsBar;
    if (statsEl) {
      statsEl.textContent = `${words} words • ~${tokens} tokens • ${variablesCount} variables`;
    }
  },

  detectAndSyncVariables(): void {
    const textarea = BuilderDOM.textarea;
    if (!textarea) return;

    const text = textarea.value;
    const detected = VariablesManager.detectVariables(text);

    // Auto update mode if variables are present
    if (detected.length > 0 && activeMode === 'plain') {
      activeMode = 'template';
      this.updateModeButtons();
    }

    const previousConfigNames = activeVariablesConfig
      .map((c) => c.name)
      .sort()
      .join(',');
    const newConfigNames = detected.sort().join(',');

    // Sync configs mapping
    activeVariablesConfig = VariablesManager.syncConfigurations(detected, activeVariablesConfig);

    // Only re-render if the list of variable names has actually changed!
    if (previousConfigNames !== newConfigNames) {
      this.renderVariablesTab();
    }
    this.triggerPreviewUpdate();
    this.syncStats();
  },

  renderVariablesTab(): void {
    const container = BuilderDOM.variableList;
    if (!container) return;

    container.innerHTML = '';

    if (activeVariablesConfig.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="border: 1px dashed var(--color-border-default); padding: var(--space-4); text-align: center; border-radius: var(--radius-md);">
          <p class="empty-state__title" style="margin: 0; font-size: var(--font-size-md); font-weight: var(--font-weight-semibold);">No variables detected</p>
          <p class="empty-state__message" style="margin: var(--space-1) 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Type double curly brackets <code>{{variable_name}}</code> in the editor to parameterize your prompt.</p>
        </div>
      `;
      return;
    }

    activeVariablesConfig.forEach((variable, index) => {
      const card = document.createElement('li');
      card.className = 'variable-card';

      // Inline playground value matching
      const currentVal = (playgroundValues[variable.name] ?? variable.defaultValue ?? '') as string;

      // Preview Field generator html
      let previewFieldHtml = '';
      if (variable.type === 'choice') {
        const optionsMarkup = (variable.choices || [])
          .map(
            (opt: string) =>
              `<option value="${escapeHtml(opt)}" ${currentVal === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
          )
          .join('');
        previewFieldHtml = `<select class="var-playground-val">${optionsMarkup}</select>`;
      } else if (variable.type === 'boolean') {
        previewFieldHtml = `
          <label class="toggle-switch">
            <input type="checkbox" class="var-playground-val" ${currentVal === 'true' ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        `;
      } else if (variable.type === 'long-text') {
        previewFieldHtml = `<textarea class="var-playground-val" rows="2" placeholder="${escapeHtml(variable.placeholder || '')}">${escapeHtml(currentVal)}</textarea>`;
      } else if (variable.type === 'date') {
        previewFieldHtml = `<input type="date" class="var-playground-val" value="${escapeHtml(currentVal)}" />`;
      } else if (variable.type === 'url') {
        previewFieldHtml = `<input type="url" class="var-playground-val" value="${escapeHtml(currentVal)}" placeholder="https://..." />`;
      } else {
        previewFieldHtml = `<input type="text" class="var-playground-val" value="${escapeHtml(currentVal)}" placeholder="${escapeHtml(variable.placeholder || '')}" />`;
      }

      card.innerHTML = `
        <div class="var-card-header">
          <span class="var-card-name">{{${escapeHtml(variable.name)}}}</span>
          <label class="toggle-switch" title="Required field">
            <input type="checkbox" class="var-required" ${variable.required ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="pn-var-card-grid">
          <span class="pn-var-card-label">Type</span>
          <div class="pn-var-card-input-wrap">
            <select class="pn-var-type">
              <option value="text" ${variable.type === 'text' ? 'selected' : ''}>Text</option>
              <option value="long-text" ${variable.type === 'long-text' ? 'selected' : ''}>Long Text</option>
              <option value="number" ${variable.type === 'number' ? 'selected' : ''}>Number</option>
              <option value="boolean" ${variable.type === 'boolean' ? 'selected' : ''}>Boolean</option>
              <option value="date" ${variable.type === 'date' ? 'selected' : ''}>Date</option>
              <option value="url" ${variable.type === 'url' ? 'selected' : ''}>URL</option>
              <option value="email" ${variable.type === 'email' ? 'selected' : ''}>Email</option>
              <option value="choice" ${variable.type === 'choice' ? 'selected' : ''}>Choice (Dropdown)</option>
            </select>
          </div>

          <span class="pn-var-card-label">Default</span>
          <div class="pn-var-card-input-wrap">
            <input type="text" class="pn-var-default" value="${escapeHtml(variable.defaultValue || '')}" placeholder="Default value..." />
          </div>

          <span class="pn-var-card-label pn-choice-label ${variable.type === 'choice' ? '' : 'hidden'}">Choices</span>
          <div class="pn-var-card-input-wrap pn-choice-input-wrap ${variable.type === 'choice' ? '' : 'hidden'}">
            <input type="text" class="pn-var-choices" value="${escapeHtml((variable.choices || []).join(', '))}" placeholder="A, B, C..." />
          </div>

          <span class="pn-var-card-label">Preview Value</span>
          <div class="pn-var-card-input-wrap">
            ${previewFieldHtml}
          </div>
        </div>
      `;

      // Elements binds
      const typeSelect = card.querySelector('.pn-var-type') as HTMLSelectElement;
      const requiredCheck = card.querySelector('.var-required') as HTMLInputElement;
      const defaultInput = card.querySelector('.pn-var-default') as HTMLInputElement;
      const choicesInput = card.querySelector('.pn-var-choices') as HTMLInputElement;
      const playgroundInput = card.querySelector('.var-playground-val') as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement;

      const choicesLabel = card.querySelector('.pn-choice-label') as HTMLElement;
      const choicesWrap = card.querySelector('.pn-choice-input-wrap') as HTMLElement;

      const updateConfig = () => {
        const type = typeSelect.value as any;
        const required = requiredCheck.checked;
        const defaultValue = defaultInput.value;
        const choices = choicesInput.value
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);

        choicesLabel.classList.toggle('hidden', type !== 'choice');
        choicesWrap.classList.toggle('hidden', type !== 'choice');

        // Check toggle value updates
        let playgroundVal = '';
        if (variable.type === 'boolean') {
          playgroundVal = String((playgroundInput as HTMLInputElement).checked);
        } else {
          playgroundVal = playgroundInput.value;
        }

        activeVariablesConfig[index] = {
          name: variable.name,
          type,
          required,
          defaultValue,
          placeholder: variable.placeholder || `Enter ${variable.name}...`,
          choices,
        };

        playgroundValues[variable.name] = playgroundVal;

        isDirty = true;
        this.triggerAutosave();
        this.triggerPreviewUpdate();
      };

      typeSelect.addEventListener('change', () => {
        // When type changes, we re-render variable cards to adjust layout
        updateConfig();
        this.renderVariablesTab();
      });
      requiredCheck.addEventListener('change', updateConfig);
      defaultInput.addEventListener('input', updateConfig);
      choicesInput.addEventListener('input', updateConfig);

      playgroundInput.addEventListener('input', () => {
        let val = '';
        if (variable.type === 'boolean') {
          val = String((playgroundInput as HTMLInputElement).checked);
        } else {
          val = playgroundInput.value;
        }
        playgroundValues[variable.name] = val;
        this.triggerPreviewUpdate();
      });

      playgroundInput.addEventListener('change', () => {
        let val = '';
        if (variable.type === 'boolean') {
          val = String((playgroundInput as HTMLInputElement).checked);
        } else {
          val = playgroundInput.value;
        }
        playgroundValues[variable.name] = val;
        this.triggerPreviewUpdate();
      });

      // Prepopulate
      if (variable.type === 'boolean') {
        playgroundValues[variable.name] = String((playgroundInput as HTMLInputElement).checked);
      } else {
        playgroundValues[variable.name] = playgroundInput.value;
      }

      container.appendChild(card);
    });
  },

  previewFrameId: null as number | null,

  previewTimeout: null as any,

  triggerPreviewUpdate(): void {
    if (this.previewTimeout) {
      clearTimeout(this.previewTimeout);
    }
    this.previewTimeout = setTimeout(() => {
      this.updatePreviewBox();
    }, 150);
  },

  updatePreviewBox(): void {
    const renderedBox = BuilderDOM.previewBox;
    const rawBox = BuilderDOM.rawBox;
    const textarea = BuilderDOM.textarea;
    if (!textarea) return;

    // Use current playground inputs or configuration defaults
    const values: Record<string, string> = {};
    activeVariablesConfig.forEach((c) => {
      values[c.name] = (playgroundValues[c.name] ?? c.defaultValue ?? '') as string;
    });

    const compiled = VariablesManager.compile(textarea.value, values, activeVariablesConfig);

    if (activePreviewSubtab === 'rendered') {
      if (renderedBox) {
        if (!compiled.trim()) {
          renderedBox.innerHTML =
            '<p class="empty-preview-msg">Start writing to see a preview.</p>';
          return;
        }
        let html = escapeHtml(compiled);
        // Convert Headings
        html = html
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>');
        // Code blocks
        html = html.replace(
          /```([\s\S]*?)```/g,
          '<pre class="pn-preview-code-block"><code>$1</code></pre>'
        );
        if (renderedBox.innerHTML !== html) {
          renderedBox.innerHTML = html;
        }
      }
    } else {
      if (rawBox) {
        let html = escapeHtml(textarea.value);
        // Highlight variables in Raw too
        html = html.replace(/(\{\{[\s\S]*?\}\})/g, '<span class="editor-var-highlight">$1</span>');
        html = html
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>');
        if (rawBox.innerHTML !== html) {
          rawBox.innerHTML = html;
        }
      }
    }
  },

  switchTab(tabName: string): void {
    const container = BuilderDOM.workspace;
    const clickedTab = BuilderDOM.root.querySelector(
      `.builder-workspace-tab[data-builder-tab="${tabName}"]`
    );

    if (clickedTab?.classList.contains('active')) {
      // Toggle collapse if clicking the already active tab!
      container?.classList.toggle('collapsed');
      clickedTab.classList.remove('active');
      clickedTab.setAttribute('aria-selected', 'false');
      BuilderDOM.root.querySelectorAll('.builder-workspace-tab-pane').forEach((pane) => {
        pane.classList.remove('active');
      });
      return;
    }

    container?.classList.remove('collapsed');

    BuilderDOM.root.querySelectorAll('.builder-workspace-tab').forEach((tab) => {
      const isSelected = tab.getAttribute('data-builder-tab') === tabName;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', String(isSelected));
    });

    BuilderDOM.root.querySelectorAll('.builder-workspace-tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.getAttribute('data-builder-pane') === tabName);
    });

    if (tabName === 'preview') {
      this.triggerPreviewUpdate();
    } else if (tabName === 'versions' && activePromptId) {
      void this.renderVersionsList();
    }
  },

  switchSubtab(subtabName: 'rendered' | 'raw'): void {
    activePreviewSubtab = subtabName;
    BuilderDOM.root.querySelectorAll('.subtab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-subtab') === subtabName);
    });

    const renderedBox = BuilderDOM.previewBox;
    const rawBox = BuilderDOM.rawBox;

    if (subtabName === 'rendered') {
      renderedBox?.classList.remove('hidden');
      rawBox?.classList.add('hidden');
    } else {
      renderedBox?.classList.add('hidden');
      rawBox?.classList.remove('hidden');
    }
    this.triggerPreviewUpdate();
  },

  async renderVersionsList(): Promise<void> {
    const container = BuilderDOM.versionList;
    const diffContainer = BuilderDOM.diffContainer;
    if (!container || !activePromptId) return;

    diffContainer?.classList.add('hidden');
    container.classList.remove('hidden');

    const versions = await PromptVersionStore.getVersions(activePromptId);
    container.innerHTML = '';

    if (versions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="border: 1px dashed var(--color-border-default); padding: var(--space-4); text-align: center; border-radius: var(--radius-md);">
          <p class="empty-state__title" style="margin: 0; font-size: var(--font-size-md); font-weight: var(--font-weight-semibold);">No version history</p>
          <p class="empty-state__message" style="margin: var(--space-1) 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Saving manual changes will commit version history snapshots.</p>
        </div>
      `;
      return;
    }

    versions.forEach((version: PromptVersion) => {
      const div = document.createElement('li');
      div.className = 'detail-version-item';
      div.innerHTML = `
        <div class="version-info">
          <span class="version-number">v${version.version}</span>
          <span class="version-annotation">${escapeHtml(version.annotation || 'Manual snapshot')}</span>
          <span class="version-date">${formatShortDate(version.updatedAt)}</span>
        </div>
        <div class="version-actions">
          <button class="button button--ghost button--sm" data-action="diff" type="button">Diff</button>
          <button class="button button--ghost button--sm" data-action="restore" type="button">Restore</button>
        </div>
      `;

      div.querySelector('[data-action="diff"]')?.addEventListener('click', () => {
        const diffBox = BuilderDOM.diffBox;
        const textarea = BuilderDOM.textarea;
        if (diffBox && textarea && diffContainer) {
          diffBox.innerHTML = renderLineDiff(version.text, textarea.value);
          container.classList.add('hidden');
          diffContainer.classList.remove('hidden');
        }
      });

      div.querySelector('[data-action="restore"]')?.addEventListener('click', () => {
        void PnDialog.confirm(`Restore editor content to version v${version.version}?`, {
          title: 'Restore Version',
          confirmLabel: 'Restore',
        }).then((confirmed) => {
          if (confirmed) {
            const textarea = BuilderDOM.textarea;
            const titleEl = BuilderDOM.titleInput;
            const descEl = BuilderDOM.descInput;
            const catEl = BuilderDOM.categorySelect;

            if (textarea) textarea.value = version.text;
            if (titleEl) titleEl.value = version.title;
            if (descEl) descEl.value = version.description;
            if (catEl) catEl.value = version.category || 'general';

            // Restore tags hidden input and badges
            const tagsHidden = BuilderDOM.tagsHidden;
            if (tagsHidden) tagsHidden.value = (version.tags || []).join(',');
            const badgesWrap = BuilderDOM.tagsContainer;
            const tagsInput = BuilderDOM.tagsInput;
            if (badgesWrap) {
              badgesWrap.querySelectorAll('.tag-badge').forEach((b) => b.remove());
              (version.tags || []).forEach((tag: string) => {
                const badge = document.createElement('span');
                badge.className = 'tag-badge';
                badge.innerHTML = `${escapeHtml(tag)}<span class="tag-badge-close">&times;</span>`;
                badge.querySelector('.tag-badge-close')?.addEventListener('click', () => {
                  badge.remove();
                  this.syncTagsInput();
                });
                badgesWrap.insertBefore(badge, tagsInput);
              });
            }

            activeVariablesConfig = version.variables || [];
            this.updateEditorHighlights();
            this.syncStats();
            this.detectAndSyncVariables();

            isDirty = true;
            this.triggerAutosave();

            this.switchTab('preview');

            const DomHelpers = (window as any).DomHelpers;
            if (DomHelpers?.showToast)
              DomHelpers.showToast(`Restored to version v${version.version}`);
          }
        });
      });

      container.appendChild(div);
    });
  },

  syncTagsInput(): void {
    const badgesWrap = BuilderDOM.tagsContainer;
    const tagsHidden = BuilderDOM.tagsHidden;
    if (!badgesWrap || !tagsHidden) return;

    const tags: string[] = [];
    badgesWrap.querySelectorAll('.tag-badge').forEach((badge) => {
      const text = String(badge.firstChild?.textContent || '').trim();
      if (text) tags.push(text);
    });
    tagsHidden.value = tags.join(',');
    isDirty = true;
    this.triggerAutosave();
  },

  async loadCategoriesList(): Promise<void> {
    const storageState = await chrome.storage.local.get(['custom_categories']);
    categoriesList = (storageState.custom_categories || []) as Array<{
      id: string;
      name: string;
      color: string;
    }>;

    const select = BuilderDOM.categorySelect;
    if (!select) return;

    const currentVal = select.value || 'general';

    select.innerHTML = `
      <option value="general">General</option>
      <option value="writing">Writing</option>
      <option value="coding">Coding</option>
      <option value="study">Study</option>
      <option value="research">Research</option>
      <option value="creative">Creative</option>
      <option value="work">Work</option>
    `;

    categoriesList.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });

    select.value = currentVal;
  },

  async renderInlineCategoriesList(): Promise<void> {
    const listContainer = BuilderDOM.categoriesList;
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const all = [
      { id: 'general', name: 'General', color: CATEGORY_COLORS.general },
      { id: 'writing', name: 'Writing', color: CATEGORY_COLORS.writing },
      { id: 'coding', name: 'Coding', color: CATEGORY_COLORS.coding },
      { id: 'study', name: 'Study', color: CATEGORY_COLORS.study },
      { id: 'research', name: 'Research', color: CATEGORY_COLORS.research },
      { id: 'creative', name: 'Creative', color: CATEGORY_COLORS.creative },
      { id: 'work', name: 'Work', color: CATEGORY_COLORS.work },
      ...categoriesList,
    ];

    all.forEach((cat) => {
      const isSystem = [
        'general',
        'writing',
        'coding',
        'study',
        'research',
        'creative',
        'work',
      ].includes(cat.id);
      const row = document.createElement('div');
      row.className = 'builder-category-manage-row';
      row.innerHTML = `
        <span class="category-dot" style="background-color: ${cat.color || '#6366F1'}"></span>
        <span class="category-name">${escapeHtml(cat.name)}</span>
        ${isSystem ? '<span class="system-badge">System</span>' : '<button class="btn-delete-cat" type="button" title="Delete category">&times;</button>'}
      `;

      if (!isSystem) {
        row.querySelector('.btn-delete-cat')?.addEventListener('click', async () => {
          categoriesList = categoriesList.filter((c) => c.id !== cat.id);
          await chrome.storage.local.set({ custom_categories: categoriesList });
          await this.loadCategoriesList();
          await this.renderInlineCategoriesList();
        });
      }
      listContainer.appendChild(row);
    });
  },

  updateStatusText(status: string): void {
    const dotEl = BuilderDOM.statusDot;
    const textEl = BuilderDOM.statusText;
    if (!dotEl || !textEl) return;

    if (saveStatusInterval) clearInterval(saveStatusInterval);

    if (status === 'Draft saved' || status === 'Saved') {
      dotEl.className = 'status-dot status-dot--saved';
      const updateLabel = () => {
        if (lastSavedTime === 0) {
          textEl.textContent = 'Draft saved';
          return;
        }
        const diff = Math.floor((Date.now() - lastSavedTime) / 1000);
        if (diff < 5) {
          textEl.textContent = 'Draft saved';
        } else if (diff < 60) {
          textEl.textContent = `Draft saved ${diff}s ago`;
        } else {
          textEl.textContent = `Draft saved ${Math.floor(diff / 60)}m ago`;
        }
      };
      updateLabel();
      saveStatusInterval = setInterval(updateLabel, 5000);
    } else if (status === 'Saved to library') {
      dotEl.className = 'status-dot status-dot--saved';
      textEl.textContent = 'Saved to library';
      setTimeout(() => {
        if (!isDirty && textEl.textContent === 'Saved to library') {
          dotEl.className = 'status-dot';
          textEl.textContent = '';
        }
      }, 3000);
    } else if (status === 'Saving draft...') {
      dotEl.className = 'status-dot status-dot--saving';
      textEl.textContent = 'Saving draft...';
    } else if (status === 'Unsaved changes' || status === 'Unsaved Changes') {
      dotEl.className = 'status-dot status-dot--dirty';
      textEl.textContent = 'Unsaved changes';
    } else {
      dotEl.className = 'status-dot';
      textEl.textContent = status;
    }
  },

  triggerAutosave(): void {
    if (!checkDirtyState()) {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      this.updateStatusText('');
      return;
    }

    this.updateStatusText('Unsaved changes');
    if (autosaveTimer) clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(async () => {
      this.updateStatusText('Saving draft...');
      try {
        const textEl = BuilderDOM.textarea;
        const titleEl = BuilderDOM.titleInput;
        const descEl = BuilderDOM.descInput;
        const catEl = BuilderDOM.categorySelect;
        const tagsHidden = BuilderDOM.tagsHidden;
        const favEl = BuilderDOM.favoriteInput;
        const pinEl = BuilderDOM.pinnedInput;

        const text = String(textEl?.value || '').trim();
        const title = String(titleEl?.value || '').trim();
        const description = String(descEl?.value || '').trim();
        const category = catEl?.value || 'general';
        const tags = tagsHidden?.value
          ? tagsHidden.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
        const isFavorite = favEl ? favEl.checked : false;
        const isPinned = pinEl ? pinEl.checked : false;

        const cacheKey = `temporary_draft_${activePromptId || 'new'}`;
        await chrome.storage.local.set({
          [cacheKey]: {
            id: activePromptId,
            title,
            description,
            text,
            tags,
            category,
            isFavorite,
            isPinned,
            variables: activeVariablesConfig,
            playgroundValues,
            selectionStart: textEl?.selectionStart || 0,
            selectionEnd: textEl?.selectionEnd || 0,
            timestamp: Date.now(),
          },
        });

        lastSavedTime = Date.now();
        this.updateStatusText('Draft saved');
      } catch (err) {
        console.error(err);
      }
    }, 600); // 600ms experimental responsive autosave debounce timing
  },

  async findDuplicatePrompt(text: string): Promise<Prompt | null> {
    const prompts = await PromptStore.getPrompts();
    // Stage 1 & 2: Exact Hash & Normalized Text
    for (const p of prompts) {
      if (p.id === activePromptId) continue;
      if (SimilarityEngine.checkSimilarity(p.text, text) === 100) {
        return p;
      }
    }
    // Stage 3: N-Gram character overlap
    for (const p of prompts) {
      if (p.id === activePromptId) continue;
      if (SimilarityEngine.checkSimilarity(p.text, text) >= 75) {
        return p;
      }
    }
    return null;
  },

  showDuplicateBanner(duplicate: Prompt): void {
    const banner = BuilderDOM.duplicateBanner;
    if (!banner) return;

    const textEl = BuilderDOM.textarea;
    const similarity = SimilarityEngine.checkSimilarity(duplicate.text, textEl?.value || '');

    banner.innerHTML = `
      <div style="flex: 1; display: flex; align-items: center; gap: var(--space-2);">
        <span>⚠ Nearly identical prompt found: <strong>"${escapeHtml(duplicate.title)}"</strong> (${similarity}% match).</span>
      </div>
      <div style="display: flex; gap: var(--space-2);">
        <button data-action="dup-open" class="button button--ghost" type="button" style="padding: 2px var(--space-2); font-size: var(--font-size-xs); height: 24px; min-height: 24px;">Open Existing</button>
        <button data-action="dup-replace" class="button button--ghost" type="button" style="padding: 2px var(--space-2); font-size: var(--font-size-xs); height: 24px; min-height: 24px;">Replace</button>
        <button data-action="dup-save" class="button button--primary" type="button" style="padding: 2px var(--space-2); font-size: var(--font-size-xs); height: 24px; min-height: 24px;">Save Anyway</button>
      </div>
    `;

    banner.classList.remove('hidden');

    banner.querySelector('[data-action="dup-open"]')?.addEventListener('click', () => {
      banner.classList.add('hidden');
      this.forceClose();
      const PromptsUI = (window as any).PromptsUI;
      if (PromptsUI?.openPreviewPanel) {
        void PromptsUI.openPreviewPanel(duplicate);
      }
    });

    banner.querySelector('[data-action="dup-replace"]')?.addEventListener('click', async () => {
      banner.classList.add('hidden');
      const titleEl = BuilderDOM.titleInput;
      const descEl = BuilderDOM.descInput;
      const catEl = BuilderDOM.categorySelect;
      const tagsHidden = BuilderDOM.tagsHidden;

      const title = String(titleEl?.value || '').trim() || duplicate.title;
      const description = String(descEl?.value || '').trim() || duplicate.description;
      const category = catEl?.value || duplicate.category;
      const tags = tagsHidden?.value ? tagsHidden.value.split(',').filter(Boolean) : duplicate.tags;

      await PromptStore.updatePrompt(
        duplicate.id,
        {
          title,
          description,
          text: textEl.value,
          category,
          tags,
          isTemplate: activeMode === 'template',
          variables: activeVariablesConfig,
        },
        'Replaced with duplicate draft'
      );

      this.forceClose();
      if (callbacks.onPromptSaved) {
        callbacks.onPromptSaved();
      }
    });

    banner.querySelector('[data-action="dup-save"]')?.addEventListener('click', () => {
      banner.classList.add('hidden');
      void this.save('Save duplicate anyway', true);
    });
  },

  async save(annotation = 'Manual save', force = false): Promise<void> {
    const textEl = BuilderDOM.textarea;
    const titleEl = BuilderDOM.titleInput;
    const descEl = BuilderDOM.descInput;
    const catEl = BuilderDOM.categorySelect;
    const tagsHidden = BuilderDOM.tagsHidden;
    const favEl = BuilderDOM.favoriteInput;
    const pinEl = BuilderDOM.pinnedInput;

    const text = String(textEl?.value || '').trim();
    if (!text) {
      await PnDialog.alert('Prompt text is required!', { title: 'Required Field' });
      return;
    }

    if (!checkDirtyState()) {
      isDirty = false;
      const DomHelpers = (window as any).DomHelpers;
      if (DomHelpers?.showToast) DomHelpers.showToast('No changes to save.');
      this.forceClose();
      return;
    }

    if (!force) {
      const duplicate = await this.findDuplicatePrompt(text);
      if (duplicate) {
        this.showDuplicateBanner(duplicate);
        return;
      }
    }

    const title = String(titleEl?.value || '').trim() || 'Untitled Prompt';
    const description = String(descEl?.value || '').trim();
    const category = catEl?.value || 'general';
    const tags = tagsHidden?.value
      ? tagsHidden.value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const isFavorite = favEl ? favEl.checked : false;
    const isPinned = pinEl ? pinEl.checked : false;
    const isTemplate = activeMode === 'template';

    let savedPrompt: Prompt | null = null;

    if (activePromptId) {
      // Manual save commits a version history snapshot!
      savedPrompt = await PromptStore.updatePrompt(
        activePromptId,
        {
          title,
          description,
          text,
          tags,
          isTemplate,
          category,
          isFavorite,
          isPinned,
          variables: activeVariablesConfig,
        },
        annotation
      );
    } else {
      // Create new prompt
      savedPrompt = await PromptStore.savePrompt({
        title,
        description,
        text,
        tags,
        isTemplate,
        category,
        isFavorite,
        isPinned,
        variables: activeVariablesConfig,
      });
    }

    if (savedPrompt) {
      // Clear autosave cache
      const cacheKey = `temporary_draft_${activePromptId || 'new'}`;
      await chrome.storage.local.remove([cacheKey, 'active_draft_session_id']);

      activePromptId = savedPrompt.id;
      isDirty = false;
      lastSavedTime = Date.now();

      const DomHelpers = (window as any).DomHelpers;
      if (DomHelpers?.showToast) DomHelpers.showToast('Prompt saved successfully!');

      this.hideUnsavedChangesDialog();
      this.forceClose();

      if (callbacks.onPromptSaved) {
        callbacks.onPromptSaved();
      }
    } else {
      await PnDialog.alert('Failed to save prompt.', { title: 'Error' });
    }
  },

  bindEvents(): void {
    const textarea = BuilderDOM.textarea;
    const titleInput = BuilderDOM.titleInput;
    const descInput = BuilderDOM.descInput;
    const catSelect = BuilderDOM.categorySelect;

    if (textarea) {
      textarea.addEventListener('input', () => {
        isDirty = true;
        this.updateEditorHighlights();
        this.syncStats();
        this.detectAndSyncVariables();
        this.triggerAutosave();
        this.triggerDiagnostics();
      });

      textarea.addEventListener('scroll', () => {
        const backdrop = BuilderDOM.editorBackdrop;
        if (backdrop) {
          backdrop.scrollTop = textarea.scrollTop;
          backdrop.scrollLeft = textarea.scrollLeft;
        }
      });

      textarea.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const val = textarea.value;
          textarea.value = val.substring(0, start) + '  ' + val.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 2;
          textarea.dispatchEvent(new Event('input'));
        }
      });
    }

    if (titleInput) {
      titleInput.addEventListener('input', () => {
        isDirty = true;
        this.triggerAutosave();
        this.triggerDiagnostics();
      });
    }

    if (descInput) {
      descInput.addEventListener('input', () => {
        isDirty = true;
        this.triggerAutosave();
        this.triggerDiagnostics();
      });
    }

    if (catSelect) {
      catSelect.addEventListener('change', () => {
        isDirty = true;
        this.triggerAutosave();
        this.triggerDiagnostics();
      });
    }

    // Header close / save
    BuilderDOM.root.querySelector('#builder-close')?.addEventListener('click', () => {
      this.close();
    });

    BuilderDOM.root.querySelector('#builder-save')?.addEventListener('click', () => {
      void this.save();
    });

    // Sub-tab toggling for Preview
    BuilderDOM.root.querySelectorAll('.subtab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const sub = (e.currentTarget as HTMLElement).getAttribute('data-subtab') as
          | 'rendered'
          | 'raw';
        this.switchSubtab(sub || 'rendered');
      });
    });

    // Standalone Button Bind
    BuilderDOM.root.querySelector('#builder-standalone-btn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('app.html?mode=standalone') });
    });

    // More Options button toggle dropdown menu
    const moreBtn = BuilderDOM.root.querySelector('#builder-more-btn');
    const moreMenu = BuilderDOM.root.querySelector('#builder-more-menu');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!moreMenu.contains(target) && target !== moreBtn && !moreBtn.contains(target)) {
          moreMenu.classList.add('hidden');
        }
      });
    }

    // Mode Selector buttons inside menu dropdown
    BuilderDOM.modePlain?.addEventListener('click', () => {
      activeMode = 'plain';
      this.updateModeButtons();
      this.detectAndSyncVariables();
      isDirty = true;
      this.triggerAutosave();
    });

    BuilderDOM.modeTemplate?.addEventListener('click', () => {
      activeMode = 'template';
      this.updateModeButtons();
      this.detectAndSyncVariables();
      isDirty = true;
      this.triggerAutosave();
    });

    // Favorite and Pinned toggle binds inside dropdown
    const favEl = BuilderDOM.favoriteInput;
    favEl?.addEventListener('change', async () => {
      isDirty = true;
      this.triggerAutosave();
      if (activePromptId) {
        await PromptStore.setFavorite(activePromptId, favEl.checked);
      }
    });

    const pinEl = BuilderDOM.pinnedInput;
    pinEl?.addEventListener('change', async () => {
      isDirty = true;
      this.triggerAutosave();
      if (activePromptId) {
        await PromptStore.setPinned(activePromptId, pinEl.checked);
      }
    });

    // Delete inside menu dropdown
    BuilderDOM.root
      .querySelector('#builder-more-delete-btn')
      ?.addEventListener('click', async () => {
        if (activePromptId) {
          void PnDialog.confirm('Are you sure you want to delete this prompt?', {
            title: 'Delete Prompt',
            confirmLabel: 'Delete',
            danger: true,
          }).then(async (confirmed) => {
            if (confirmed) {
              await PromptStore.deletePrompt(activePromptId!);
              isDirty = false;
              this.forceClose();
              if (callbacks.onPromptSaved) {
                callbacks.onPromptSaved();
              }
            }
          });
        } else {
          // Just discard if new
          this.forceClose();
        }
        moreMenu?.classList.add('hidden');
      });

    // Unsaved Dialog Actions Binds
    BuilderDOM.unsavedDialog.querySelector('#unsaved-save')?.addEventListener('click', () => {
      void this.save();
    });

    BuilderDOM.unsavedDialog.querySelector('#unsaved-discard')?.addEventListener('click', () => {
      this.hideUnsavedChangesDialog();
      this.forceClose();
      if (callbacks.onPromptSaved) {
        callbacks.onPromptSaved();
      }
    });

    BuilderDOM.unsavedDialog.querySelector('#unsaved-continue')?.addEventListener('click', () => {
      this.hideUnsavedChangesDialog();
    });

    // Tab bindings
    BuilderDOM.root.querySelectorAll('.builder-workspace-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const tabName =
          (e.currentTarget as HTMLElement).getAttribute('data-builder-tab') || 'preview';
        this.switchTab(tabName);
      });
    });

    // Preview Toolbar button bind toggle bottom preview tab
    BuilderDOM.root
      .querySelector('#builder-workspace-tab-toggle-preview')
      ?.addEventListener('click', () => {
        this.switchTab('preview');
      });

    // Inline category management toggler
    BuilderDOM.categoryManageBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pane = BuilderDOM.categoriesPane;
      if (pane) {
        pane.classList.toggle('hidden');
        if (!pane.classList.contains('hidden')) {
          await this.renderInlineCategoriesList();
        }
      }
    });

    // Add category inline
    BuilderDOM.addCategoryBtn?.addEventListener('click', async () => {
      const input = BuilderDOM.newCategoryInput;
      const name = String(input?.value || '').trim();
      if (!name) return;

      const newCat = {
        id: `custom-${crypto.randomUUID().slice(0, 8)}`,
        name,
        color: '#6366F1',
      };

      categoriesList.push(newCat);
      await chrome.storage.local.set({ custom_categories: categoriesList });
      if (input) input.value = '';
      await this.loadCategoriesList();
      await this.renderInlineCategoriesList();
    });

    // Tag autocomplete input handling
    const tagsInput = BuilderDOM.tagsInput;
    const badgesWrap = BuilderDOM.tagsContainer;
    if (tagsInput && badgesWrap) {
      tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const tag = String(tagsInput.value || '')
            .replace(/,/g, '')
            .trim();
          if (tag) {
            const badge = document.createElement('span');
            badge.className = 'tag-badge';
            badge.innerHTML = `${escapeHtml(tag)}<span class="tag-badge-close">&times;</span>`;
            badge.querySelector('.tag-badge-close')?.addEventListener('click', () => {
              badge.remove();
              this.syncTagsInput();
            });
            badgesWrap.insertBefore(badge, tagsInput);
            tagsInput.value = '';
            this.syncTagsInput();
          }
        }
      });
    }

    // Version diff close back btn
    BuilderDOM.closeDiffBtn?.addEventListener('click', () => {
      BuilderDOM.diffContainer?.classList.add('hidden');
      BuilderDOM.versionList?.classList.remove('hidden');
    });

    BuilderDOM.suggestTitleBtn?.addEventListener('click', () => {
      const textEl = BuilderDOM.textarea;
      const titleEl = BuilderDOM.titleInput;
      if (textEl && titleEl) {
        const suggestion = PromptDiagnostics.suggestTitle(textEl.value);
        titleEl.value = suggestion;
        isDirty = true;
        this.triggerAutosave();
        this.runDiagnostics();
      }
    });
  },
};

if (typeof window !== 'undefined') {
  (window as any).PromptForm = PromptForm;
}
export default PromptForm;
