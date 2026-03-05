(() => {
/**
 * File: sidepanel/history-ui.js
 * Purpose: History tab rendering and row actions.
 */

const getPlatformLabel = (platform) => {
  const key = String(platform || '').toLowerCase();
  return PLATFORM_LABELS[key] || String(platform || 'Unknown');
};

const createHistoryCard = async (entry) => {
  const card = document.createElement('article');
  card.className = 'pn-history-card';

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = entry.title || 'Untitled chat';

  const meta = document.createElement('p');
  meta.className = 'pn-card-meta';
  meta.textContent = `${getPlatformLabel(entry.platform)} • ${new Date(entry.createdAt).toLocaleString()}`;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of entry.tags || []) {
    tagsWrap.appendChild(createTagPill(tag));
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const exportMd = document.createElement('button');
  exportMd.className = 'pn-btn pn-btn--ghost';
  exportMd.type = 'button';
  exportMd.textContent = 'Export MD';

  exportMd.addEventListener('click', () => {
    void (async () => {
      const result = await window.Exporter.exportChat(entry, 'md');

      if (!result?.ok) {
        await showToast(result?.error || 'Markdown export failed.');
      }
    })();
  });

  const exportPdf = document.createElement('button');
  exportPdf.className = 'pn-btn pn-btn--ghost';
  exportPdf.type = 'button';
  exportPdf.textContent = 'Export PDF';

  exportPdf.addEventListener('click', () => {
    void (async () => {
      const result = await window.Exporter.exportChat(entry, 'pdf');

      if (!result?.ok) {
        await showToast(result?.error || 'PDF export failed.');
      }
    })();
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'pn-btn pn-btn-danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';

  deleteButton.addEventListener('click', () => {
    void (async () => {
      const deleted = await window.Store.deleteChatFromHistory(entry.id);

      if (!deleted) {
        await showToast('Delete failed.');
        return;
      }

      await render();
    })();
  });

  actions.appendChild(exportMd);
  actions.appendChild(exportPdf);
  actions.appendChild(deleteButton);

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(tagsWrap);
  card.appendChild(actions);
  return card;
};

const render = async () => {
  const container = byId('history-list');

  if (!container) {
    return;
  }

  const history = await window.Store.getChatHistory();
  const reversed = [...history].reverse();
  container.innerHTML = '';

  if (!reversed.length) {
    container.appendChild(createEmptyState({
      title: 'No exports yet',
      message: 'Export a chat to get started.',
      actionLabel: 'Open prompts',
      onAction: () => {
        if (window.AppShell?.switchTab) {
          void window.AppShell.switchTab('prompts');
        }
      }
    }));
    return;
  }

  for (const entry of reversed) {
    container.appendChild(await createHistoryCard(entry));
  }
};

window.HistoryUI = {
  render,
  getPlatformLabel
};
})();
