(() => {
  /**
   * File: utils/tags.js
   * Purpose: Shared tag badge UI and parsing functions used by popup, sidepanel, and toolbar.
   * Eliminates duplication of addTagBadge, syncBadgesToHidden, and parseTags.
   */

  /** Converts comma-separated tag text into normalized string array. */
  const parseTags = (raw: any) =>
    String(raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  /** Syncs badge tags to the hidden prompt-tags input. */
  const syncBadgesToHidden = () => {
    const wrap = document.getElementById('tag-badges-wrap');
    const hidden = document.getElementById('prompt-tags') as HTMLInputElement | null;
    if (!wrap || !hidden) return;
    const tags = Array.from(wrap.querySelectorAll('.pn-tag-badge'))
      .map((b) => (b as HTMLElement).dataset.tag)
      .filter(Boolean);
    hidden.value = tags.join(', ');
  };

  /** Adds a single tag badge to the badge container and syncs to hidden input. */
  const addTagBadge = (tag: any) => {
    const normalized = String(tag || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (!normalized) return;

    const wrap = document.getElementById('tag-badges-wrap');
    const input = document.getElementById('prompt-tags-input');
    if (!wrap) return;

    // Prevent duplicate badges
    const existing = Array.from(wrap.querySelectorAll('.pn-tag-badge')).map(
      (b) => (b as HTMLElement).dataset.tag
    );
    if (existing.includes(normalized)) return;

    const badge = document.createElement('span');
    badge.className = 'pn-tag-badge';
    badge.dataset.tag = normalized;
    badge.textContent = normalized;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'pn-tag-badge__remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      badge.remove();
      syncBadgesToHidden();
    });
    badge.appendChild(removeBtn);

    if (input) {
      wrap.insertBefore(badge, input);
    } else {
      wrap.appendChild(badge);
    }
    syncBadgesToHidden();
  };

  const Tags = { parseTags, syncBadgesToHidden, addTagBadge };

  if (typeof window !== 'undefined') {
    Object.assign(window, Tags);
    window.Tags = Tags;
  }
})();
