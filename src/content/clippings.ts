/**
 * File: src/content/clippings.ts
 * Purpose: Content script for capturing selection, displaying Note overlay, and enrichment.
 */

import { getCurrentAdapter } from '../platforms';
import { toast } from '../utils/toast';

(() => {
  const SETTINGS_KEY = 'promptiumSettings';
  const CLIPPINGS_KEY = 'clippings';
  let activePlatform = '';
  let shortcutConfig = { alt: true, shift: true, ctrl: false, meta: false, key: 'b' };

  // Parse key shortcut
  const parseShortcut = (raw = 'Alt+Shift+B') => {
    const parts = raw
      .split('+')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const config = { alt: false, shift: false, ctrl: false, meta: false, key: '' };
    parts.forEach((part) => {
      if (part === 'alt' || part === 'option') config.alt = true;
      if (part === 'shift') config.shift = true;
      if (part === 'ctrl' || part === 'control') config.ctrl = true;
      if (part === 'cmd' || part === 'command' || part === 'meta') config.meta = true;
      if (
        !['alt', 'option', 'shift', 'ctrl', 'control', 'cmd', 'command', 'meta'].includes(part) &&
        !config.key
      ) {
        config.key = part;
      }
    });
    if (!config.key) config.key = 'b';
    return config;
  };

  const loadShortcut = async () => {
    try {
      const snap = (await chrome.storage.local.get([SETTINGS_KEY])) as any;
      const raw =
        snap?.[SETTINGS_KEY]?.clippingShortcut ||
        snap?.[SETTINGS_KEY]?.bookmarkShortcut ||
        'Alt+Shift+B';
      shortcutConfig = parseShortcut(raw);
    } catch (_) {}
  };

  const isShortcutMatch = (e: KeyboardEvent) => {
    const key = String(e.key || '').toLowerCase();
    return (
      e.altKey === shortcutConfig.alt &&
      e.shiftKey === shortcutConfig.shift &&
      e.ctrlKey === shortcutConfig.ctrl &&
      e.metaKey === shortcutConfig.meta &&
      key === shortcutConfig.key
    );
  };

  // Helper to suggest tags locally and instantly
  const suggestTagsLocally = (text: string): string[] => {
    const t = text.toLowerCase();
    const map = [
      { tag: 'TypeScript', kws: ['typescript', 'ts', 'tsx'] },
      { tag: 'JavaScript', kws: ['javascript', 'js', 'jsx'] },
      { tag: 'Database', kws: ['database', 'db', 'sql', 'postgres', 'supabase', 'prisma', 'rls'] },
      { tag: 'CSS', kws: ['css', 'tailwind', 'flexbox', 'grid', 'styling'] },
      { tag: 'Flutter', kws: ['flutter', 'dart'] },
      { tag: 'Architecture', kws: ['architecture', 'design pattern', 'refactor', 'module'] },
      { tag: 'Research', kws: ['research', 'paper', 'summary', 'analysis'] },
      { tag: 'API', kws: ['api', 'rest', 'graphql', 'endpoint', 'http'] },
    ];
    return map.filter((item) => item.kws.some((kw) => t.includes(kw))).map((item) => item.tag);
  };

  // Capture surrounding context of the selection
  const captureSurroundingContext = (selection: Selection): string => {
    try {
      if (selection.rangeCount === 0) return '';
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const parent =
        container.nodeType === Node.ELEMENT_NODE
          ? (container as HTMLElement)
          : container.parentElement;
      if (!parent) return '';

      // Attempt to get surrounding paragraphs or siblings
      let text = '';
      if (parent.previousElementSibling) {
        text += (parent.previousElementSibling as HTMLElement).innerText + '\n\n';
      }
      text += parent.innerText;
      if (parent.nextElementSibling) {
        text += '\n\n' + (parent.nextElementSibling as HTMLElement).innerText;
      }

      return text.slice(0, 3000);
    } catch (_) {
      return '';
    }
  };

  // Display the optional note dialog directly in the page
  const showNoteOverlay = (
    clippingId: string,
    initialText: string,
    onSave: (note: string, tags: string[]) => void
  ) => {
    // Remove existing
    document.getElementById('pn-clipping-note-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pn-clipping-note-overlay';
    overlay.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 320px;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: pn-slide-up 0.2s ease-out;
    `;

    // Add CSS Keyframe animation dynamically
    if (!document.getElementById('pn-clipping-styles')) {
      const style = document.createElement('style');
      style.id = 'pn-clipping-styles';
      style.textContent = `
        @keyframes pn-slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    const title = document.createElement('div');
    title.textContent = '✓ Clipping Saved';
    title.style.cssText = 'font-weight: 600; font-size: 14px; color: #10b981;';
    titleRow.appendChild(title);
    overlay.appendChild(titleRow);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Add optional note...';
    textarea.style.cssText = `
      width: 100%;
      height: 60px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 8px;
      color: #f8fafc;
      font-size: 12px;
      resize: none;
      outline: none;
      box-sizing: border-box;
    `;
    overlay.appendChild(textarea);

    // Tags Section
    const suggestedTags = suggestTagsLocally(initialText);
    const tagsContainer = document.createElement('div');
    tagsContainer.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-height: 50px;
      overflow-y: auto;
    `;
    const selectedTagsSet = new Set<string>(suggestedTags);

    const renderTags = () => {
      tagsContainer.innerHTML = '';
      suggestedTags.forEach((tag) => {
        const tagEl = document.createElement('span');
        tagEl.textContent = tag;
        const isActive = selectedTagsSet.has(tag);
        tagEl.style.cssText = `
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 9999px;
          cursor: pointer;
          border: 1px solid ${isActive ? '#10b981' : 'rgba(255, 255, 255, 0.1)'};
          background: ${isActive ? 'rgba(16, 185, 129, 0.15)' : 'transparent'};
          color: ${isActive ? '#34d399' : '#94a3b8'};
          transition: all 0.15s ease;
        `;
        tagEl.addEventListener('click', () => {
          if (selectedTagsSet.has(tag)) {
            selectedTagsSet.delete(tag);
          } else {
            selectedTagsSet.add(tag);
          }
          renderTags();
        });
        tagsContainer.appendChild(tagEl);
      });
    };
    renderTags();
    overlay.appendChild(tagsContainer);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;
    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 12px;
      cursor: pointer;
      padding: 6px 12px;
    `;
    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Done';
    doneBtn.style.cssText = `
      background: #10b981;
      border: none;
      color: #ffffff;
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      padding: 6px 16px;
    `;

    const closeOverlay = () => {
      overlay.style.animation = 'pn-slide-up 0.2s ease-in reverse';
      setTimeout(() => overlay.remove(), 180);
    };

    skipBtn.addEventListener('click', closeOverlay);
    doneBtn.addEventListener('click', () => {
      onSave(textarea.value.trim(), Array.from(selectedTagsSet));
      closeOverlay();
    });

    btnRow.appendChild(skipBtn);
    btnRow.appendChild(doneBtn);
    overlay.appendChild(btnRow);
    document.body.appendChild(overlay);

    textarea.focus();

    // Auto-dismiss after 15s if no action taken
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        closeOverlay();
      }
    }, 15000);
  };

  const sanitizeConversationUrl = (value = window.location.href) => {
    try {
      const parsed = new URL(String(value || '').trim());
      return `${parsed.origin}${parsed.pathname}`;
    } catch (_) {
      return '';
    }
  };

  // Pipeline 1: Quick Capture & Save
  const performSaveFlow = async (text: string) => {
    if (!text) return;
    const adapter = getCurrentAdapter();
    const platform = adapter?.id || 'web';
    const conversationId = sanitizeConversationUrl();
    const conversationTitle = document.title || 'Conversation';

    const clippingId = crypto.randomUUID();
    const initialClipping = {
      id: clippingId,
      platform,
      conversationId,
      conversationTitle,
      selectedText: text,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revisionCount: 1,
    };

    // Pipeline 1: Instant storage save
    const snap = (await chrome.storage.local.get([CLIPPINGS_KEY]).catch(() => ({}))) as any;
    const list = Array.isArray(snap[CLIPPINGS_KEY]) ? snap[CLIPPINGS_KEY] : [];
    list.push(initialClipping);
    await chrome.storage.local.set({ [CLIPPINGS_KEY]: list }).catch(() => {});

    // Toast feedback in content page context
    toast.success('Saved clipping.');

    // Launch optional Note dialog overlay
    showNoteOverlay(clippingId, text, async (note, tags) => {
      // Pipeline 2: Background / Lazy enrichment
      const updatedSnap = (await chrome.storage.local
        .get([CLIPPINGS_KEY])
        .catch(() => ({}))) as any;
      const updatedList = Array.isArray(updatedSnap[CLIPPINGS_KEY])
        ? updatedSnap[CLIPPINGS_KEY]
        : [];
      const itemIndex = updatedList.findIndex((item: any) => item.id === clippingId);
      if (itemIndex >= 0) {
        const selection = window.getSelection();
        const context = selection ? captureSurroundingContext(selection) : '';
        updatedList[itemIndex] = {
          ...updatedList[itemIndex],
          note: note || undefined,
          tags: tags,
          surroundingContext: context || undefined,
          updatedAt: Date.now(),
        };
        await chrome.storage.local.set({ [CLIPPINGS_KEY]: updatedList }).catch(() => {});
      }
    });
  };

  const init = async (platform: string) => {
    activePlatform = platform;
    await loadShortcut();

    // Listen for custom shortcut trigger
    document.addEventListener('keydown', (e) => {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';
      if (!text) return;

      const isEditable =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLInputElement &&
            !['button', 'checkbox', 'radio', 'submit'].includes(e.target.type)));
      if (isEditable) return;

      if (isShortcutMatch(e)) {
        e.preventDefault();
        void performSaveFlow(text);
      }
    });

    // Listen for SAVE_CLIPPING message from context menu or background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.action === 'SAVE_CLIPPING' || msg?.type === 'SAVE_CLIPPING') {
        const selText = msg.text || window.getSelection()?.toString()?.trim() || '';
        if (selText) {
          void performSaveFlow(selText);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'No selection' });
        }
      }
    });
  };

  const Clippings = {
    init,
    performSaveFlow,
  };

  if (typeof window !== 'undefined') {
    (window as any).Clippings = Clippings;
  }
})();
