import { PromptIntelligenceEngine } from './intelligence';
import { PromptRefinementContext, PromptRecommendation } from './intelligence/types';
import { doInject } from '../prompt-library/prompt-actions';
import { getSelectionContext } from './notes/selection';
import { showNoteDialog } from './notes/dialog';
import { renderNotesSidebar } from './notes/sidebar';
import { adjustOffsetsAfterTextChange, clear as clearNotes } from './notes/store';

let currentPromptId: string | null = null;
let currentTags: string[] = [];
let currentOptions: any = {};
let currentContext: PromptRefinementContext | null = null;
let originalPromptText: string = "";

const callbacks = {
  onPromptTextReplaced: null as (() => void) | null,
  onLibraryChanged: null as (() => void) | null,
  onSwitchTab: null as ((tabName: string) => void) | null,
};

export const setCallbacks = (nextCallbacks: any = {}): void => {
  callbacks.onPromptTextReplaced = nextCallbacks.onPromptTextReplaced || null;
  callbacks.onLibraryChanged = nextCallbacks.onLibraryChanged || null;
  callbacks.onSwitchTab = nextCallbacks.onSwitchTab || null;
};

const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

export const close = (): void => {
  const modal = byId('pn-improve-modal');
  if (modal) modal.classList.add('pn-hidden');
  clearNotes();
};

let analysisDebounceTimeout: any = null;

const runAnalysisAndRender = async (text: string): Promise<void> => {
  try {
    const context = await PromptIntelligenceEngine.generateRewriteContext(text);
    currentContext = context;
    renderWorkspace(context);
  } catch (err: any) {
    console.error("Analysis failed:", err);
  }
};

const getHealthLabelAndClass = (score: number): { label: string; className: string } => {
  if (score >= 85) return { label: 'Excellent', className: 'pn-health-badge--excellent' };
  if (score >= 70) return { label: 'Good', className: 'pn-health-badge--good' };
  if (score >= 50) return { label: 'Fair', className: 'pn-health-badge--fair' };
  return { label: 'Needs Work', className: 'pn-health-badge--needs-work' };
};

const renderWorkspace = (context: PromptRefinementContext) => {
  const badge = byId('pn-improve-health-badge');
  if (badge) {
    const health = getHealthLabelAndClass(context.scoreBreakdown.overall);
    badge.textContent = health.label;
    badge.className = `pn-health-badge ${health.className}`;
  }

  // Render notes sidebar
  const notesContainer = byId('pn-notes-sidebar-list');
  const textArea = byId<HTMLTextAreaElement>('pn-improve-text-area');
  if (notesContainer && textArea) {
    renderNotesSidebar(notesContainer, textArea);
  }

  // Render Strengths and Weaknesses lists
  const strengthsList = byId('pn-improve-strengths-list');
  const weaknessesList = byId('pn-improve-weaknesses-list');
  
  if (strengthsList && weaknessesList) {
    strengthsList.innerHTML = '';
    weaknessesList.innerHTML = '';

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    const issuesMap = new Set(context.promptIssues.map(i => i.id));

    if (issuesMap.has('rule_missing_objective')) {
      weaknesses.push('Unclear objective');
    } else {
      strengths.push('Clear objective defined');
    }

    if (issuesMap.has('rule_missing_context')) {
      weaknesses.push('Lacks background context');
    } else {
      strengths.push('Good context supplied');
    }

    if (issuesMap.has('rule_missing_constraints')) {
      weaknesses.push('Missing negative constraints');
    } else {
      strengths.push('Limits and constraints defined');
    }

    if (issuesMap.has('rule_missing_format')) {
      weaknesses.push('No output format specified');
    } else {
      strengths.push('Structured format requested');
    }

    if (issuesMap.has('rule_contains_placeholder')) {
      weaknesses.push('Contains unfilled placeholders');
    }

    if (context.scoreBreakdown.grammar >= 90) {
      strengths.push('Correct grammar & spelling');
    } else {
      weaknesses.push('Grammar or spelling issues');
    }

    strengths.forEach(s => {
      const li = document.createElement('li');
      li.textContent = `✓ ${s}`;
      strengthsList.appendChild(li);
    });

    weaknesses.forEach(w => {
      const li = document.createElement('li');
      li.textContent = `• ${w}`;
      weaknessesList.appendChild(li);
    });

    if (strengths.length === 0) {
      strengthsList.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None detected</span>';
    }
    if (weaknesses.length === 0) {
      weaknessesList.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None detected</span>';
    }
  }

  // Render Smart Recommendations Cards
  const deck = byId('pn-improve-recommendation-deck');
  if (deck) {
    deck.innerHTML = '';

    context.recommendations.forEach(rec => {
      const card = document.createElement('div');
      card.className = 'pn-rec-card';

      // Setup Group Category Color indicator styles
      let catColor = '#38bdf8'; // light blue default (Context/Clarity)
      if (rec.category === 'Constraints') catColor = '#fbbf24'; // yellow
      else if (rec.category === 'Output Format') catColor = '#f472b6'; // pink
      else if (rec.category === 'Structure') catColor = '#c084fc'; // purple
      else if (rec.category === 'Model Optimization') catColor = '#34d399'; // green

      // Build before/after impact previews if available
      let previewHtml = '';
      if (rec.beforePreview || rec.afterPreview) {
        const beforeTxt = rec.beforePreview || '(Not defined)';
        const afterTxt = rec.afterPreview || '';
        previewHtml = `
          <div style="font-size: 10.5px; margin-top: 6px; background: rgba(0,0,0,0.15); padding: 6px; border-radius: var(--radius-xs); border: 1px solid rgba(255,255,255,0.03); font-family: var(--font-mono); overflow-x: auto; max-width: 100%;">
            <div style="color: var(--text-muted); text-decoration: line-through; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Before: "${beforeTxt}"</div>
            <div style="color: #4ade80; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">After: "${afterTxt}"</div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="pn-rec-card-header">
          <span class="pn-rec-card-title">${rec.title}</span>
          <span style="font-size: 9px; padding: 1px 6px; border-radius: 8px; font-weight: 600; text-transform: uppercase; border: 1px solid ${catColor}; color: ${catColor}; font-family: var(--font-sans);">${rec.category}</span>
        </div>
        <div class="pn-rec-card-desc">${rec.description}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; font-style: italic;">
          Why? ${rec.why}
        </div>
        ${previewHtml}
        <button class="pn-btn pn-btn--primary pn-rec-apply-btn" type="button" style="margin-top: 6px;">Apply</button>
      `;

      card.querySelector('.pn-rec-apply-btn')?.addEventListener('click', async () => {
        if (!textArea) return;
        const currentText = textArea.value;
        let newText = currentText;

        // Apply Logic Router
        if (rec.applyId === 'rule_missing_objective') {
          newText = `Objective: [Enter task objective here]\n\n${currentText}`;
        } else if (rec.applyId === 'rule_missing_context') {
          newText = `${currentText}\n\nContext: [Provide details about your project or goal]`;
        } else if (rec.applyId === 'rule_missing_constraints') {
          newText = `${currentText}\n\nConstraints:\n- Limit the response to key details.\n- Avoid unnecessary preamble.`;
        } else if (rec.applyId === 'rule_missing_format') {
          newText = `${currentText}\n\nOutput Format:\n- Format response using markdown headings/lists.`;
        } else if (rec.applyId === 'rule_contains_placeholder') {
          textArea.focus();
          const pIssue = context.promptIssues.find(i => i.id === rec.id);
          if (pIssue) {
            const index = currentText.indexOf(pIssue.original);
            if (index !== -1) {
              textArea.setSelectionRange(index, index + pIssue.original.length);
            }
          }
        } else if (rec.applyId === 'model_claude_xml') {
          newText = `<context>\n${currentText}\n</context>`;
        } else if (rec.applyId === 'model_chatgpt_criteria') {
          newText = `${currentText}\n\nCriteria:\n- Output must follow instructions strictly.`;
        } else if (rec.applyId === 'model_codex_api') {
          newText = `${currentText}\n\n// API Signature:\n// function init()`;
        } else if (rec.applyId.startsWith('agent_rec_')) {
          const idx = parseInt(rec.applyId.replace('agent_rec_', ''), 10);
          if (context.agentRecommendations[idx]) {
            newText = `${currentText}\n\n// ${context.agentRecommendations[idx]}`;
          }
        } else if (rec.applyId === 'apply_pattern') {
          newText = context.upgradedPrompt;
        } else if (rec.applyId === 'apply_role') {
          newText = `### Role\n${context.skillPack.role}\n\n${currentText}`;
        } else {
          // Fallback check: could be Harper grammar replacement
          const grammarIssue = context.promptIssues.find(i => i.id === rec.id);
          if (grammarIssue && grammarIssue.span && grammarIssue.replacement) {
            const { start, end } = grammarIssue.span;
            newText = currentText.slice(0, start) + grammarIssue.replacement + currentText.slice(end);
          }
        }

        adjustOffsetsAfterTextChange(currentText, newText);
        textArea.value = newText;
        await runAnalysisAndRender(newText);
      });

      deck.appendChild(card);
    });

    if (deck.children.length === 0) {
      deck.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 16px 0;">No active recommendations — prompt is well optimized!</div>';
    }
  }
};

export const open = (
  promptId: string | null,
  text: string,
  tags: string[],
  options: any = {}
): void => {
  currentPromptId = promptId;
  currentTags = tags || [];
  currentOptions = options || {};
  currentContext = null;
  originalPromptText = text;
  clearNotes();

  const modal = byId('pn-improve-modal');
  if (modal) modal.classList.remove('pn-hidden');

  const loading = byId('pn-improve-loading');
  if (loading) loading.classList.add('pn-hidden');
  const errorDiv = byId('pn-improve-error');
  if (errorDiv) errorDiv.classList.add('pn-hidden');
  const infoOverlay = byId('pn-improve-info-overlay');
  if (infoOverlay) infoOverlay.classList.add('pn-hidden');
  const transparencyOverlay = byId('pn-improve-transparency-overlay');
  if (transparencyOverlay) transparencyOverlay.classList.add('pn-hidden');

  const origPreview = byId('pn-improve-original-preview');
  if (origPreview) {
    origPreview.textContent = text;
  }

  const textArea = byId<HTMLTextAreaElement>('pn-improve-text-area');
  if (textArea) {
    textArea.value = text;
  }

  void runAnalysisAndRender(text);
};

export const bindEvents = (): void => {
  const closeBtn = byId('pn-improve-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  const backdrop = document.querySelector('[data-close-improve]');
  if (backdrop) {
    backdrop.addEventListener('click', close);
  }

  const infoBtn = byId('pn-improve-info-btn');
  const infoOverlay = byId('pn-improve-info-overlay');
  if (infoBtn && infoOverlay) {
    infoBtn.addEventListener('click', () => {
      infoOverlay.classList.remove('pn-hidden');
    });
  }

  const infoOk = byId('pn-improve-info-ok');
  if (infoOk && infoOverlay) {
    infoOk.addEventListener('click', () => {
      infoOverlay.classList.add('pn-hidden');
    });
  }

  // Rewrite Transparency Overlay Events
  const transparencyOverlay = byId('pn-improve-transparency-overlay');
  const transparencyCancel = byId('pn-improve-transparency-cancel');
  const transparencyConfirm = byId('pn-improve-transparency-confirm');

  if (transparencyCancel && transparencyOverlay) {
    transparencyCancel.addEventListener('click', () => {
      transparencyOverlay.classList.add('pn-hidden');
    });
  }

  const textArea = byId<HTMLTextAreaElement>('pn-improve-text-area');
  const floatingAddNote = byId<HTMLButtonElement>('pn-floating-add-note');

  if (textArea) {
    // Monitor keyup/mouseup selection details
    const handleSelection = () => {
      const selection = getSelectionContext();
      if (selection) {
        floatingAddNote?.classList.remove('pn-hidden');
      } else {
        floatingAddNote?.classList.add('pn-hidden');
      }
    };

    textArea.addEventListener('mouseup', handleSelection);
    textArea.addEventListener('keyup', handleSelection);

    floatingAddNote?.addEventListener('click', () => {
      const selection = getSelectionContext();
      if (!selection) return;

      showNoteDialog(
        textArea,
        selection.startOffset,
        selection.endOffset,
        selection.selectedText,
        () => {
          // Re-render notes lists and context layout
          if (currentContext) {
            void runAnalysisAndRender(textArea.value);
          }
        }
      );
    });

    textArea.addEventListener('input', () => {
      if (analysisDebounceTimeout) clearTimeout(analysisDebounceTimeout);
      analysisDebounceTimeout = setTimeout(() => {
        void runAnalysisAndRender(textArea.value);
      }, 400);
    });
  }

  // Fix Action
  const btnFix = byId('pn-improve-btn-fix');
  if (btnFix) {
    btnFix.addEventListener('click', async () => {
      if (!currentContext || !textArea) return;
      
      const originalVal = textArea.value;
      let textToFix = originalVal;
      const fixable = [...currentContext.promptIssues]
        .filter(i => i.span && typeof i.replacement === 'string')
        .sort((a, b) => b.span!.start - a.span!.start);
      
      for (const issue of fixable) {
        const { start, end } = issue.span!;
        textToFix = textToFix.slice(0, start) + issue.replacement + textToFix.slice(end);
      }
      
      adjustOffsetsAfterTextChange(originalVal, textToFix);
      textArea.value = textToFix;
      await runAnalysisAndRender(textToFix);
    });
  }

  // Upgrade Action
  const btnUpgrade = byId('pn-improve-btn-upgrade');
  if (btnUpgrade) {
    btnUpgrade.addEventListener('click', async () => {
      if (!currentContext || !textArea) return;
      const originalVal = textArea.value;
      adjustOffsetsAfterTextChange(originalVal, currentContext.upgradedPrompt);
      textArea.value = currentContext.upgradedPrompt;
      await runAnalysisAndRender(currentContext.upgradedPrompt);
    });
  }

  // Rewrite Pre-flight Transparency Action
  const btnRewrite = byId('pn-improve-btn-rewrite');
  const renderTransparencyOverlay = (context: PromptRefinementContext) => {
    const result = context.retrievalResult;
    if (!result) return;

    const used = byId('pn-transparency-token-used');
    const bar = byId('pn-transparency-token-bar');
    const status = byId('pn-transparency-budget-status');
    const list = byId('pn-transparency-items-list');

    if (used) used.textContent = String(result.budget.totalTokens);
    if (bar) {
      const pct = Math.min(100, (result.budget.totalTokens / result.budget.limit) * 100);
      bar.style.width = `${pct}%`;
    }
    if (status) {
      status.style.display = result.budget.isTruncated ? 'block' : 'none';
    }

    if (list) {
      list.innerHTML = '';
      const allItems: { type: string; title: string; explanation: string; score: number; tokens: number; color: string }[] = [];

      if (result.skill) {
        allItems.push({
          type: 'Skill Persona',
          title: result.skill.item.title,
          explanation: result.skill.explanation,
          score: result.skill.score,
          tokens: result.skill.tokenCount,
          color: '#c084fc'
        });
      }

      result.notes.forEach(n => {
        allItems.push({
          type: 'Refinement Note',
          title: `"${n.item.selectedText.slice(0, 30)}..."`,
          explanation: n.explanation,
          score: n.score,
          tokens: n.tokenCount,
          color: '#fbbf24'
        });
      });

      result.instructions.forEach(i => {
        allItems.push({
          type: 'Instruction',
          title: i.item.title || 'Preference Rule',
          explanation: i.explanation,
          score: i.score,
          tokens: i.tokenCount,
          color: '#34d399'
        });
      });

      result.knowledge.forEach(k => {
        allItems.push({
          type: 'Knowledge Guide',
          title: k.item.title,
          explanation: k.explanation,
          score: k.score,
          tokens: k.tokenCount,
          color: '#38bdf8'
        });
      });

      if (allItems.length === 0) {
        list.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px 0;">No context retrieved. Only base prompt will be processed.</div>';
        return;
      }

      allItems.forEach(i => {
        const card = document.createElement('div');
        card.style.background = 'rgba(255, 255, 255, 0.03)';
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        card.style.borderRadius = 'var(--radius-sm, 6px)';
        card.style.padding = '8px 10px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '4px';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 9px; padding: 1px 6px; border-radius: 8px; font-weight: 600; text-transform: uppercase; border: 1px solid ${i.color}; color: ${i.color}; font-family: var(--font-sans);">${i.type}</span>
            <span style="font-size: 10px; color: var(--text-muted); font-weight: 500; font-family: var(--font-mono);">Score: ${i.score.toFixed(2)} | ${i.tokens} tkn</span>
          </div>
          <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${i.title}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-style: italic;">${i.explanation}</div>
        `;
        list.appendChild(card);
      });
    }
  };

  if (btnRewrite && transparencyOverlay) {
    btnRewrite.addEventListener('click', () => {
      if (!currentContext || !textArea) return;
      renderTransparencyOverlay(currentContext);
      transparencyOverlay.classList.remove('pn-hidden');
    });
  }

  // Rewrite Confirm Actual Execution
  if (transparencyConfirm && transparencyOverlay) {
    transparencyConfirm.addEventListener('click', () => {
      if (!currentContext || !textArea) return;
      
      transparencyOverlay.classList.add('pn-hidden');

      const loading = byId('pn-improve-loading');
      if (loading) loading.classList.remove('pn-hidden');
      const errorDiv = byId('pn-improve-error');
      if (errorDiv) errorDiv.classList.add('pn-hidden');

      const buttons = [btnFix, btnUpgrade, btnRewrite, byId('pn-improve-accept'), closeBtn] as HTMLButtonElement[];
      buttons.forEach(b => { if (b) b.disabled = true; });

      chrome.runtime.sendMessage(
        {
          type: 'AI_IMPROVE_PROMPT',
          text: textArea.value,
          tags: currentTags,
          style: 'general',
          context: currentContext
        },
        async (response) => {
          if (loading) loading.classList.add('pn-hidden');
          buttons.forEach(b => { if (b) b.disabled = false; });

          if (response && response.ok && response.text) {
            const originalVal = textArea.value;
            adjustOffsetsAfterTextChange(originalVal, response.text);
            textArea.value = response.text;
            await runAnalysisAndRender(response.text);
          } else {
            if (errorDiv) {
              const errorMsg = byId('pn-improve-error-msg');
              if (errorMsg) {
                errorMsg.textContent = response?.error || 'Gemini rewrite request failed.';
              }
              errorDiv.classList.remove('pn-hidden');
              setTimeout(() => errorDiv.classList.add('pn-hidden'), 4000);
            }
          }
        }
      );
    });
  }

  // Apply Action
  const btnApply = byId('pn-improve-accept');
  if (btnApply) {
    btnApply.addEventListener('click', async () => {
      if (!textArea) return;
      const finalText = textArea.value;

      if (currentOptions.context === 'fab') {
        await doInject(finalText);
      } else {
        const promptTextarea = byId<HTMLTextAreaElement>('prompt-text');
        if (promptTextarea && !byId('pn-add-modal')?.classList.contains('pn-hidden')) {
          promptTextarea.value = finalText;
          promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const templateTextarea = byId<HTMLTextAreaElement>('pn-template-text');
        if (templateTextarea && !byId('pn-add-modal')?.classList.contains('pn-hidden')) {
          templateTextarea.value = finalText;
          templateTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (callbacks.onPromptTextReplaced) {
          callbacks.onPromptTextReplaced();
        }
      }

      close();
    });
  }
};
