// File: src/prompt/builder/builder.ts
import { Prompt, VariableConfig } from '../types/types';
import { PromptStore } from '../storage/storage';
import { PromptVersionStore, PromptVersion } from '../versions/versions';
import { VariablesManager } from '../variables/variables';
import { PromptDiagnostics } from '../diagnostics/diagnostics';
import { SimilarityEngine } from '../../shared/utils/similarity';

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
        html += `<div class="pn-diff-line pn-diff-line--unchanged">  ${escapeHtml(oldLine)}</div>`;
      }
    } else {
      if (oldLine !== undefined) {
        html += `<div class="pn-diff-line pn-diff-line--removed">- ${escapeHtml(oldLine)}</div>`;
      }
      if (newLine !== undefined) {
        html += `<div class="pn-diff-line pn-diff-line--added">+ ${escapeHtml(newLine)}</div>`;
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
    const textEl = document.getElementById('prompt-text') as HTMLTextAreaElement;
    const titleEl = document.getElementById('prompt-title') as HTMLInputElement;
    const descEl = document.getElementById('prompt-description') as HTMLInputElement;
    const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;

    if (!textEl || !titleEl) return;

    const text = textEl.value;
    const title = titleEl.value;
    const description = descEl?.value || '';
    const tags = tagsHidden?.value ? tagsHidden.value.split(',').filter(Boolean) : [];

    const result = PromptDiagnostics.run(title, text, tags, description, activeVariablesConfig);

    // 1. Update Diagnostics Tab button count text
    const tabBtn = document.getElementById('pn-builder-tab-diagnostics');
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
    const container = document.getElementById('pn-builder-diagnostics-container');
    if (container) {
      container.innerHTML = '';
      if (result.issues.length === 0) {
        container.innerHTML = `
          <div class="pn-empty-state" style="border: 1px dashed var(--color-border-default); padding: var(--space-4); text-align: center; border-radius: var(--radius-md); width: 100%; box-sizing: border-box;">
            <p class="pn-empty-state__title" style="margin: 0; font-size: var(--font-size-md); color: var(--color-success-soft); font-weight: 600;">✓ All checks passed</p>
            <p class="pn-empty-state__message" style="margin: var(--space-1) 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Your prompt meets all quality and styling guidelines.</p>
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
    const healthEl = document.getElementById('pn-builder-health-score');
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
    const suggestBtn = document.getElementById('pn-suggest-title-btn');
    if (suggestBtn) {
      const cleanTitle = title.trim().toLowerCase();
      const isGeneric = !cleanTitle || GENERIC_TITLES.has(cleanTitle);
      if (isGeneric && text.trim().length > 5) {
        suggestBtn.classList.remove('pn-hidden');
      } else {
        suggestBtn.classList.add('pn-hidden');
      }
    }
  },

  async open(
    options: { id?: string; mode?: 'plain' | 'template'; text?: string; description?: string } = {}
  ): Promise<void> {
    const modal = document.getElementById('add-modal');
    if (!modal) return;

    modal.classList.remove('pn-hidden');
    document.body.classList.add('pn-modal-open');

    // Reset Form elements
    activePromptId = options.id || null;
    activeMode = options.mode || 'plain';
    activeVariablesConfig = [];
    playgroundValues = {};
    isDirty = false;
    lastSavedTime = 0;

    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (saveStatusInterval) clearInterval(saveStatusInterval);

    const textEl = document.getElementById('prompt-text') as HTMLTextAreaElement;
    const titleEl = document.getElementById('prompt-title') as HTMLInputElement;
    const descEl = document.getElementById('prompt-description') as HTMLInputElement;
    const catEl = document.getElementById('prompt-category') as HTMLSelectElement;
    const tagsInput = document.getElementById('prompt-tags-input') as HTMLInputElement;
    const favEl = document.getElementById('prompt-favorite') as HTMLInputElement;
    const pinEl = document.getElementById('prompt-pinned') as HTMLInputElement;

    if (textEl) textEl.value = options.text || '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = options.description || '';
    if (catEl) catEl.value = 'general';
    if (tagsInput) tagsInput.value = '';
    if (favEl) favEl.checked = false;
    if (pinEl) pinEl.checked = false;

    // Reset tags hidden list
    const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;
    if (tagsHidden) tagsHidden.value = '';
    const badgesWrap = document.getElementById('builder-tag-badges-wrap');
    if (badgesWrap) {
      badgesWrap.querySelectorAll('.pn-tag-badge').forEach((b) => b.remove());
    }

    // Toggle active mode buttons styling
    this.updateModeButtons();

    // Load categories list
    await this.loadCategoriesList();

    // Save active session draft key in local storage for crash/reload recovery
    await chrome.storage.local.set({ active_draft_session_id: activePromptId || 'new' });

    // Check for prefilled draft from FAB first!
    const prefilledSnap = await chrome.storage.local.get(['pn_prefilled_draft']);
    if (prefilledSnap && prefilledSnap.pn_prefilled_draft) {
      const draft = prefilledSnap.pn_prefilled_draft as any;
      await chrome.storage.local.remove(['pn_prefilled_draft']);
      if (textEl) textEl.value = draft.text || '';
      if (descEl) descEl.value = draft.description || '';
      isDirty = true;
      lastSavedTime = Date.now();
      this.updateStatusText('Saved');
      this.triggerAutosave();
    } else {
      // Check for cached draft in local storage to automatically resume!
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

        // Re-populate tags
        if (draft.tags && draft.tags.length > 0 && badgesWrap) {
          if (tagsHidden) tagsHidden.value = draft.tags.join(',');
          draft.tags.forEach((tag: string) => {
            const badge = document.createElement('span');
            badge.className = 'pn-tag-badge';
            badge.innerHTML = `${escapeHtml(tag)}<span class="pn-tag-badge-close">&times;</span>`;
            badge.querySelector('.pn-tag-badge-close')?.addEventListener('click', () => {
              badge.remove();
              this.syncTagsInput();
            });
            badgesWrap.insertBefore(badge, tagsInput);
          });
        }
        isDirty = true;
        lastSavedTime = draft.timestamp || Date.now();
        this.updateStatusText('Saved');
      } else {
        this.updateStatusText('Saved');
      }
    }

    // Trigger initial highlights/counts
    this.updateEditorHighlights();
    this.syncStats();
    this.detectAndSyncVariables();

    // Reset bottom tabs (collapsed by default)
    const tabsContainer = document.querySelector('.pn-builder-tabs-container');
    tabsContainer?.classList.add('pn-collapsed');
    document.querySelectorAll('.pn-builder-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.pn-builder-tab-pane').forEach((p) => p.classList.remove('active'));

    // Default subtab selection
    activePreviewSubtab = 'rendered';
    this.switchSubtab('rendered');

    // Reset duplicate banner and run diagnostics immediately
    document.getElementById('pn-builder-duplicate-banner')?.classList.add('pn-hidden');
    this.runDiagnostics();

    // Autofocus editor area instantly
    textEl?.focus();
  },

  async openForEdit(prompt: Prompt): Promise<void> {
    await this.open({
      id: prompt.id,
      mode: prompt.isTemplate ? 'template' : 'plain',
      text: prompt.text,
      description: prompt.description,
    });

    const titleEl = document.getElementById('prompt-title') as HTMLInputElement;
    const catEl = document.getElementById('prompt-category') as HTMLSelectElement;
    const favEl = document.getElementById('prompt-favorite') as HTMLInputElement;
    const pinEl = document.getElementById('prompt-pinned') as HTMLInputElement;

    if (titleEl) titleEl.value = prompt.title || '';
    if (catEl) catEl.value = prompt.category || 'general';
    if (favEl) favEl.checked = Boolean(prompt.isFavorite);
    if (pinEl) pinEl.checked = Boolean(prompt.isPinned);

    // Prepopulate tags
    const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;
    if (tagsHidden) tagsHidden.value = (prompt.tags || []).join(',');
    const badgesWrap = document.getElementById('builder-tag-badges-wrap');
    const tagsInput = document.getElementById('prompt-tags-input') as HTMLInputElement;
    if (badgesWrap && prompt.tags && prompt.tags.length > 0) {
      badgesWrap.querySelectorAll('.pn-tag-badge').forEach((b) => b.remove());
      prompt.tags.forEach((tag: string) => {
        const badge = document.createElement('span');
        badge.className = 'pn-tag-badge';
        badge.innerHTML = `${escapeHtml(tag)}<span class="pn-tag-badge-close">&times;</span>`;
        badge.querySelector('.pn-tag-badge-close')?.addEventListener('click', () => {
          badge.remove();
          this.syncTagsInput();
        });
        badgesWrap.insertBefore(badge, tagsInput);
      });
    }

    activeVariablesConfig = prompt.variables || [];

    // Trigger highlights
    this.updateEditorHighlights();
    this.syncStats();
    this.detectAndSyncVariables();
    // We loaded fresh from DB, so not dirty yet!
    isDirty = false;
    this.updateStatusText('Saved');
    this.runDiagnostics();

    // Autofocus editor area instantly
    const textEl = document.getElementById('prompt-text') as HTMLTextAreaElement;
    textEl?.focus();
  },

  async openPlainPrefilled(text: string, sourceUrl = ''): Promise<void> {
    await this.open({
      mode: 'plain',
      text: text,
      description: sourceUrl ? `Saved from ${sourceUrl}` : '',
    });
    isDirty = true;
    this.triggerAutosave();
  },

  close(): void {
    if (isDirty) {
      this.showUnsavedChangesDialog();
    } else {
      this.forceClose();
    }
  },

  forceClose(): void {
    const modal = document.getElementById('add-modal');
    if (modal) {
      modal.classList.add('pn-hidden');
    }
    document.body.classList.remove('pn-modal-open');
    // Clear temporary drafts on complete exit/close
    const cacheKey = `temporary_draft_${activePromptId || 'new'}`;
    void chrome.storage.local.remove([cacheKey, 'active_draft_session_id']);

    activePromptId = null;
    isDirty = false;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (saveStatusInterval) clearInterval(saveStatusInterval);
  },

  showUnsavedChangesDialog(): void {
    const dialog = document.getElementById('pn-unsaved-dialog');
    if (dialog) dialog.classList.remove('pn-hidden');
  },

  hideUnsavedChangesDialog(): void {
    const dialog = document.getElementById('pn-unsaved-dialog');
    if (dialog) dialog.classList.add('pn-hidden');
  },

  updateModeButtons(): void {
    const plainBtn = document.getElementById('pn-builder-mode-plain');
    const templateBtn = document.getElementById('pn-builder-mode-template');
    if (activeMode === 'plain') {
      plainBtn?.classList.add('active');
      templateBtn?.classList.remove('active');
    } else {
      plainBtn?.classList.remove('active');
      templateBtn?.classList.add('active');
    }
  },

  updateEditorHighlights(): void {
    const textarea = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
    const backdrop = document.getElementById('pn-editor-backdrop');
    if (!textarea || !backdrop) return;

    const val = textarea.value;
    let html = escapeHtml(val);

    // Highlight variables: {{variable}}
    html = html.replace(/(\{\{[\s\S]*?\}\})/g, '<span class="pn-editor-var-highlight">$1</span>');

    // Highlight markdown headings: # Heading
    html = html.replace(/^(#+ .*$)/gim, '<span class="pn-editor-heading-highlight">$1</span>');

    // Highlight fenced code blocks: ```code```
    html = html.replace(/(```[\s\S]*?```)/g, '<span class="pn-editor-code-highlight">$1</span>');

    backdrop.innerHTML = html + '\n';
  },

  syncStats(): void {
    const textarea = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const text = textarea.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    // Token count estimate
    const TokenCounter = (window as any).TokenCounter;
    const provider = 'gemini';
    const tokens = TokenCounter ? TokenCounter.count(text, provider).count : 0;
    const variablesCount = activeVariablesConfig.length;

    const statsEl = document.getElementById('pn-editor-stat-info');
    if (statsEl) {
      statsEl.textContent = `${words} words • ~${tokens} tokens • ${variablesCount} variables`;
    }
  },

  detectAndSyncVariables(): void {
    const textarea = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
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
    const container = document.getElementById('pn-builder-vars-container');
    if (!container) return;

    container.innerHTML = '';

    if (activeVariablesConfig.length === 0) {
      container.innerHTML = `
        <div class="pn-empty-state" style="border: 1px dashed var(--color-border-default); padding: var(--space-4); text-align: center; border-radius: var(--radius-md);">
          <p class="pn-empty-state__title" style="margin: 0; font-size: var(--font-size-md); font-weight: var(--font-weight-semibold);">No variables detected</p>
          <p class="pn-empty-state__message" style="margin: var(--space-1) 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Type double curly brackets <code>{{variable_name}}</code> in the editor to parameterize your prompt.</p>
        </div>
      `;
      return;
    }

    activeVariablesConfig.forEach((variable, index) => {
      const card = document.createElement('div');
      card.className = 'pn-variable-card';

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
        previewFieldHtml = `<select class="pn-var-playground-val">${optionsMarkup}</select>`;
      } else if (variable.type === 'boolean') {
        previewFieldHtml = `
          <label class="pn-toggle-switch">
            <input type="checkbox" class="pn-var-playground-val" ${currentVal === 'true' ? 'checked' : ''} />
            <span class="pn-toggle-slider"></span>
          </label>
        `;
      } else if (variable.type === 'long-text') {
        previewFieldHtml = `<textarea class="pn-var-playground-val" rows="2" placeholder="${escapeHtml(variable.placeholder || '')}">${escapeHtml(currentVal)}</textarea>`;
      } else if (variable.type === 'date') {
        previewFieldHtml = `<input type="date" class="pn-var-playground-val" value="${escapeHtml(currentVal)}" />`;
      } else if (variable.type === 'url') {
        previewFieldHtml = `<input type="url" class="pn-var-playground-val" value="${escapeHtml(currentVal)}" placeholder="https://..." />`;
      } else {
        previewFieldHtml = `<input type="text" class="pn-var-playground-val" value="${escapeHtml(currentVal)}" placeholder="${escapeHtml(variable.placeholder || '')}" />`;
      }

      card.innerHTML = `
        <div class="pn-var-card-header">
          <span class="pn-var-card-name">{{${escapeHtml(variable.name)}}}</span>
          <label class="pn-toggle-switch" title="Required field">
            <input type="checkbox" class="pn-var-required" ${variable.required ? 'checked' : ''} />
            <span class="pn-toggle-slider"></span>
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

          <span class="pn-var-card-label pn-choice-label ${variable.type === 'choice' ? '' : 'pn-hidden'}">Choices</span>
          <div class="pn-var-card-input-wrap pn-choice-input-wrap ${variable.type === 'choice' ? '' : 'pn-hidden'}">
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
      const requiredCheck = card.querySelector('.pn-var-required') as HTMLInputElement;
      const defaultInput = card.querySelector('.pn-var-default') as HTMLInputElement;
      const choicesInput = card.querySelector('.pn-var-choices') as HTMLInputElement;
      const playgroundInput = card.querySelector('.pn-var-playground-val') as
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

        choicesLabel.classList.toggle('pn-hidden', type !== 'choice');
        choicesWrap.classList.toggle('pn-hidden', type !== 'choice');

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

  triggerPreviewUpdate(): void {
    if (this.previewFrameId !== null) {
      cancelAnimationFrame(this.previewFrameId);
    }
    this.previewFrameId = requestAnimationFrame(() => {
      this.previewFrameId = null;
      this.updatePreviewBox();
    });
  },

  updatePreviewBox(): void {
    const renderedBox = document.getElementById('pn-builder-preview-box');
    const rawBox = document.getElementById('pn-builder-raw-box');
    const textarea = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
    if (!textarea) return;

    // Use current playground inputs or configuration defaults
    const values: Record<string, string> = {};
    activeVariablesConfig.forEach((c) => {
      values[c.name] = (playgroundValues[c.name] ?? c.defaultValue ?? '') as string;
    });

    const compiled = VariablesManager.compile(textarea.value, values, activeVariablesConfig);

    if (activePreviewSubtab === 'rendered') {
      if (renderedBox) {
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
        html = html.replace(
          /(\{\{[\s\S]*?\}\})/g,
          '<span class="pn-editor-var-highlight">$1</span>'
        );
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
    const container = document.querySelector('.pn-builder-tabs-container');
    const clickedTab = document.querySelector(`.pn-builder-tab[data-builder-tab="${tabName}"]`);

    if (clickedTab?.classList.contains('active')) {
      // Toggle collapse if clicking the already active tab!
      container?.classList.toggle('pn-collapsed');
      clickedTab.classList.remove('active');
      document.querySelectorAll('.pn-builder-tab-pane').forEach((pane) => {
        pane.classList.remove('active');
      });
      return;
    }

    container?.classList.remove('pn-collapsed');

    document.querySelectorAll('.pn-builder-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-builder-tab') === tabName);
    });

    document.querySelectorAll('.pn-builder-tab-pane').forEach((pane) => {
      pane.classList.toggle(
        'active',
        (pane.getAttribute('data-builder-pane') ||
          pane.getAttribute('data-builder-tab-content')) === tabName
      );
    });

    if (tabName === 'preview') {
      this.triggerPreviewUpdate();
    } else if (tabName === 'versions' && activePromptId) {
      void this.renderVersionsList();
    }
  },

  switchSubtab(subtabName: 'rendered' | 'raw'): void {
    activePreviewSubtab = subtabName;
    document.querySelectorAll('.pn-subtab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-subtab') === subtabName);
    });

    const renderedBox = document.getElementById('pn-builder-preview-box');
    const rawBox = document.getElementById('pn-builder-raw-box');

    if (subtabName === 'rendered') {
      renderedBox?.classList.remove('pn-hidden');
      rawBox?.classList.add('pn-hidden');
    } else {
      renderedBox?.classList.add('pn-hidden');
      rawBox?.classList.remove('pn-hidden');
    }
    this.triggerPreviewUpdate();
  },

  async renderVersionsList(): Promise<void> {
    const container = document.getElementById('pn-builder-versions-list');
    const diffContainer = document.getElementById('pn-builder-diff-container');
    if (!container || !activePromptId) return;

    diffContainer?.classList.add('pn-hidden');
    container.classList.remove('pn-hidden');

    const versions = await PromptVersionStore.getVersions(activePromptId);
    container.innerHTML = '';

    if (versions.length === 0) {
      container.innerHTML = `
        <div class="pn-empty-state" style="border: 1px dashed var(--color-border-default); padding: var(--space-4); text-align: center; border-radius: var(--radius-md);">
          <p class="pn-empty-state__title" style="margin: 0; font-size: var(--font-size-md); font-weight: var(--font-weight-semibold);">No version history</p>
          <p class="pn-empty-state__message" style="margin: var(--space-1) 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Saving manual changes will commit version history snapshots.</p>
        </div>
      `;
      return;
    }

    versions.forEach((version: PromptVersion) => {
      const div = document.createElement('div');
      div.className = 'pn-detail-version-item';
      div.innerHTML = `
        <div class="pn-version-info">
          <span class="pn-version-number">v${version.version}</span>
          <span class="pn-version-annotation">${escapeHtml(version.annotation || 'Manual snapshot')}</span>
          <span class="pn-version-date">${formatShortDate(version.updatedAt)}</span>
        </div>
        <div class="pn-version-actions">
          <button class="pn-btn pn-btn--ghost pn-btn--sm pn-diff-btn" type="button">Diff</button>
          <button class="pn-btn pn-btn--ghost pn-btn--sm pn-restore-btn" type="button">Restore</button>
        </div>
      `;

      div.querySelector('.pn-diff-btn')?.addEventListener('click', () => {
        const diffBox = document.getElementById('pn-diff-box');
        const textarea = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
        if (diffBox && textarea && diffContainer) {
          diffBox.innerHTML = renderLineDiff(version.text, textarea.value);
          container.classList.add('pn-hidden');
          diffContainer.classList.remove('pn-hidden');
        }
      });

      div.querySelector('.pn-restore-btn')?.addEventListener('click', () => {
        const confirmed = window.confirm(`Restore editor content to version v${version.version}?`);
        if (confirmed) {
          const textarea = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
          const titleEl = document.getElementById('prompt-title') as HTMLInputElement | null;
          const descEl = document.getElementById('prompt-description') as HTMLInputElement | null;
          const catEl = document.getElementById('prompt-category') as HTMLSelectElement | null;

          if (textarea) textarea.value = version.text;
          if (titleEl) titleEl.value = version.title;
          if (descEl) descEl.value = version.description;
          if (catEl) catEl.value = version.category || 'general';

          // Restore tags hidden input and badges
          const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;
          if (tagsHidden) tagsHidden.value = (version.tags || []).join(',');
          const badgesWrap = document.getElementById('builder-tag-badges-wrap');
          const tagsInput = document.getElementById('prompt-tags-input') as HTMLInputElement;
          if (badgesWrap) {
            badgesWrap.querySelectorAll('.pn-tag-badge').forEach((b) => b.remove());
            (version.tags || []).forEach((tag: string) => {
              const badge = document.createElement('span');
              badge.className = 'pn-tag-badge';
              badge.innerHTML = `${escapeHtml(tag)}<span class="pn-tag-badge-close">&times;</span>`;
              badge.querySelector('.pn-tag-badge-close')?.addEventListener('click', () => {
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

      container.appendChild(div);
    });
  },

  syncTagsInput(): void {
    const badgesWrap = document.getElementById('builder-tag-badges-wrap');
    const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;
    if (!badgesWrap || !tagsHidden) return;

    const tags: string[] = [];
    badgesWrap.querySelectorAll('.pn-tag-badge').forEach((badge) => {
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

    const select = document.getElementById('prompt-category') as HTMLSelectElement | null;
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
    const listContainer = document.getElementById('pn-manage-categories-list');
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
      row.className = 'pn-inline-category-manage-row';
      row.innerHTML = `
        <span class="pn-category-dot" style="background-color: ${cat.color || '#6366F1'}"></span>
        <span class="pn-category-name">${escapeHtml(cat.name)}</span>
        ${isSystem ? '<span class="pn-system-badge">System</span>' : '<button class="pn-btn-delete-cat" type="button" title="Delete category">&times;</button>'}
      `;

      if (!isSystem) {
        row.querySelector('.pn-btn-delete-cat')?.addEventListener('click', async () => {
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
    const dotEl = document.querySelector('.pn-status-dot');
    const textEl = document.querySelector('.pn-status-text');
    if (!dotEl || !textEl) return;

    if (saveStatusInterval) clearInterval(saveStatusInterval);

    if (status === 'Saved') {
      dotEl.className = 'pn-status-dot pn-status-dot--saved';
      const updateLabel = () => {
        if (lastSavedTime === 0) {
          textEl.textContent = 'Saved';
          return;
        }
        const diff = Math.floor((Date.now() - lastSavedTime) / 1000);
        if (diff < 5) {
          textEl.textContent = 'Saved';
        } else if (diff < 60) {
          textEl.textContent = `Saved ${diff}s ago`;
        } else {
          textEl.textContent = `Saved ${Math.floor(diff / 60)}m ago`;
        }
      };
      updateLabel();
      saveStatusInterval = setInterval(updateLabel, 5000);
    } else if (status === 'Saving...') {
      dotEl.className = 'pn-status-dot pn-status-dot--saving';
      textEl.textContent = 'Saving...';
    } else {
      dotEl.className = 'pn-status-dot pn-status-dot--dirty';
      textEl.textContent = status;
    }
  },

  triggerAutosave(): void {
    this.updateStatusText('Unsaved Changes');
    if (autosaveTimer) clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(async () => {
      this.updateStatusText('Saving...');
      try {
        const textEl = document.getElementById('prompt-text') as HTMLTextAreaElement;
        const titleEl = document.getElementById('prompt-title') as HTMLInputElement;
        const descEl = document.getElementById('prompt-description') as HTMLInputElement;
        const catEl = document.getElementById('prompt-category') as HTMLSelectElement;
        const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;
        const favEl = document.getElementById('prompt-favorite') as HTMLInputElement;
        const pinEl = document.getElementById('prompt-pinned') as HTMLInputElement;

        const text = String(textEl?.value || '').trim();
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
            timestamp: Date.now(),
          },
        });

        lastSavedTime = Date.now();
        this.updateStatusText('Saved');
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
    const banner = document.getElementById('pn-builder-duplicate-banner');
    if (!banner) return;

    const textEl = document.getElementById('prompt-text') as HTMLTextAreaElement;
    const similarity = SimilarityEngine.checkSimilarity(duplicate.text, textEl?.value || '');

    banner.innerHTML = `
      <div style="flex: 1; display: flex; align-items: center; gap: var(--space-2);">
        <span>⚠ Nearly identical prompt found: <strong>"${escapeHtml(duplicate.title)}"</strong> (${similarity}% match).</span>
      </div>
      <div style="display: flex; gap: var(--space-2);">
        <button id="pn-dup-open" class="pn-btn pn-btn--ghost" type="button" style="padding: 2px var(--space-2); font-size: var(--font-size-xs); height: 24px; min-height: 24px;">Open Existing</button>
        <button id="pn-dup-replace" class="pn-btn pn-btn--ghost" type="button" style="padding: 2px var(--space-2); font-size: var(--font-size-xs); height: 24px; min-height: 24px;">Replace</button>
        <button id="pn-dup-save" class="pn-btn pn-btn--primary" type="button" style="padding: 2px var(--space-2); font-size: var(--font-size-xs); height: 24px; min-height: 24px;">Save Anyway</button>
      </div>
    `;

    banner.classList.remove('pn-hidden');

    document.getElementById('pn-dup-open')?.addEventListener('click', () => {
      banner.classList.add('pn-hidden');
      this.forceClose();
      const PromptsUI = (window as any).PromptsUI;
      if (PromptsUI?.openPreviewPanel) {
        void PromptsUI.openPreviewPanel(duplicate);
      }
    });

    document.getElementById('pn-dup-replace')?.addEventListener('click', async () => {
      banner.classList.add('pn-hidden');
      const titleEl = document.getElementById('prompt-title') as HTMLInputElement;
      const descEl = document.getElementById('prompt-description') as HTMLInputElement;
      const catEl = document.getElementById('prompt-category') as HTMLSelectElement;
      const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;

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

    document.getElementById('pn-dup-save')?.addEventListener('click', () => {
      banner.classList.add('pn-hidden');
      void this.save('Save duplicate anyway', true);
    });
  },

  async save(annotation = 'Manual save', force = false): Promise<void> {
    const textEl = document.getElementById('prompt-text') as HTMLTextAreaElement;
    const titleEl = document.getElementById('prompt-title') as HTMLInputElement;
    const descEl = document.getElementById('prompt-description') as HTMLInputElement;
    const catEl = document.getElementById('prompt-category') as HTMLSelectElement;
    const tagsHidden = document.getElementById('prompt-tags') as HTMLInputElement;
    const favEl = document.getElementById('prompt-favorite') as HTMLInputElement;
    const pinEl = document.getElementById('prompt-pinned') as HTMLInputElement;

    const text = String(textEl?.value || '').trim();
    if (!text) {
      alert('Prompt text is required!');
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
      this.updateStatusText('Saved');

      const DomHelpers = (window as any).DomHelpers;
      if (DomHelpers?.showToast) DomHelpers.showToast('Prompt saved successfully!');

      this.hideUnsavedChangesDialog();
      this.forceClose();

      if (callbacks.onPromptSaved) {
        callbacks.onPromptSaved();
      }
    } else {
      alert('Failed to save prompt.');
    }
  },

  bindEvents(): void {
    const textarea = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
    const titleInput = document.getElementById('prompt-title') as HTMLInputElement | null;
    const descInput = document.getElementById('prompt-description') as HTMLInputElement | null;
    const catSelect = document.getElementById('prompt-category') as HTMLSelectElement | null;

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
        const backdrop = document.getElementById('pn-editor-backdrop');
        if (backdrop) {
          backdrop.scrollTop = textarea.scrollTop;
          backdrop.scrollLeft = textarea.scrollLeft;
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
    document.getElementById('pn-builder-close')?.addEventListener('click', () => {
      this.close();
    });

    document.getElementById('pn-builder-save')?.addEventListener('click', () => {
      void this.save();
    });

    // Sub-tab toggling for Preview
    document.querySelectorAll('.pn-subtab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const sub = (e.currentTarget as HTMLElement).getAttribute('data-subtab') as
          | 'rendered'
          | 'raw';
        this.switchSubtab(sub || 'rendered');
      });
    });

    // Standalone Button Bind
    document.getElementById('pn-builder-standalone-btn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('app.html?mode=standalone') });
    });

    // More Options button toggle dropdown menu
    const moreBtn = document.getElementById('pn-builder-more-btn');
    const moreMenu = document.getElementById('pn-builder-more-menu');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('pn-hidden');
      });

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!moreMenu.contains(target) && target !== moreBtn && !moreBtn.contains(target)) {
          moreMenu.classList.add('pn-hidden');
        }
      });
    }

    // Mode Selector buttons inside menu dropdown
    document.getElementById('pn-builder-mode-plain')?.addEventListener('click', () => {
      activeMode = 'plain';
      this.updateModeButtons();
      this.detectAndSyncVariables();
      isDirty = true;
      this.triggerAutosave();
    });

    document.getElementById('pn-builder-mode-template')?.addEventListener('click', () => {
      activeMode = 'template';
      this.updateModeButtons();
      this.detectAndSyncVariables();
      isDirty = true;
      this.triggerAutosave();
    });

    // Favorite and Pinned toggle binds inside dropdown
    const favEl = document.getElementById('prompt-favorite') as HTMLInputElement | null;
    favEl?.addEventListener('change', async () => {
      isDirty = true;
      this.triggerAutosave();
      if (activePromptId) {
        await PromptStore.setFavorite(activePromptId, favEl.checked);
      }
    });

    const pinEl = document.getElementById('prompt-pinned') as HTMLInputElement | null;
    pinEl?.addEventListener('change', async () => {
      isDirty = true;
      this.triggerAutosave();
      if (activePromptId) {
        await PromptStore.setPinned(activePromptId, pinEl.checked);
      }
    });

    // Delete inside menu dropdown
    document.getElementById('pn-builder-more-delete-btn')?.addEventListener('click', async () => {
      if (activePromptId) {
        const confirmed = window.confirm('Are you sure you want to delete this prompt?');
        if (confirmed) {
          await PromptStore.deletePrompt(activePromptId);
          isDirty = false;
          this.forceClose();
          if (callbacks.onPromptSaved) {
            callbacks.onPromptSaved();
          }
        }
      } else {
        // Just discard if new
        this.forceClose();
      }
      moreMenu?.classList.add('pn-hidden');
    });

    // Unsaved Dialog Actions Binds
    document.getElementById('pn-unsaved-save')?.addEventListener('click', () => {
      void this.save();
    });

    document.getElementById('pn-unsaved-discard')?.addEventListener('click', () => {
      this.hideUnsavedChangesDialog();
      this.forceClose();
      if (callbacks.onPromptSaved) {
        callbacks.onPromptSaved();
      }
    });

    document.getElementById('pn-unsaved-continue')?.addEventListener('click', () => {
      this.hideUnsavedChangesDialog();
    });

    // Tab bindings
    document.querySelectorAll('.pn-builder-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const tabName =
          (e.currentTarget as HTMLElement).getAttribute('data-builder-tab') || 'preview';
        this.switchTab(tabName);
      });
    });

    // Preview Toolbar button bind toggle bottom preview tab
    document.getElementById('pn-builder-tab-toggle-preview')?.addEventListener('click', () => {
      this.switchTab('preview');
    });

    // Inline category management toggler
    document.getElementById('pn-category-manage-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pane = document.getElementById('pn-inline-categories-pane');
      if (pane) {
        pane.classList.toggle('pn-hidden');
        if (!pane.classList.contains('pn-hidden')) {
          await this.renderInlineCategoriesList();
        }
      }
    });

    // Add category inline
    document.getElementById('pn-add-category-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('pn-new-category-input') as HTMLInputElement | null;
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
    const tagsInput = document.getElementById('prompt-tags-input') as HTMLInputElement | null;
    const badgesWrap = document.getElementById('builder-tag-badges-wrap');
    if (tagsInput && badgesWrap) {
      tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const tag = String(tagsInput.value || '')
            .replace(/,/g, '')
            .trim();
          if (tag) {
            const badge = document.createElement('span');
            badge.className = 'pn-tag-badge';
            badge.innerHTML = `${escapeHtml(tag)}<span class="pn-tag-badge-close">&times;</span>`;
            badge.querySelector('.pn-tag-badge-close')?.addEventListener('click', () => {
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
    document.getElementById('pn-close-diff-btn')?.addEventListener('click', () => {
      document.getElementById('pn-builder-diff-container')?.classList.add('pn-hidden');
      document.getElementById('pn-builder-versions-list')?.classList.remove('pn-hidden');
    });

    document.getElementById('pn-suggest-title-btn')?.addEventListener('click', () => {
      const textEl = document.getElementById('prompt-text') as HTMLTextAreaElement | null;
      const titleEl = document.getElementById('prompt-title') as HTMLInputElement | null;
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
