import { SettingsStore } from '../../stores/settings-store';

export const renderAll = async (): Promise<void> => {
  // 1. Setup Section Switch Navigation
  const nav = document.getElementById('pn-settings-nav');
  if (nav) {
    nav.innerHTML = `
      <button class="pn-settings-nav-btn is-active" data-section="providers" type="button">Providers</button>
      <button class="pn-settings-nav-btn" data-section="interface" type="button">Interface</button>
      <button class="pn-settings-nav-btn" data-section="data" type="button">Data</button>
    `;

    const navButtons = document.querySelectorAll('.pn-settings-nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        navButtons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const targetSection = btn.getAttribute('data-section');
        
        const panels = document.querySelectorAll('.pn-settings-panel');
        panels.forEach(panel => {
          if (panel.getAttribute('data-settings-section') === targetSection) {
            panel.classList.add('is-active');
          } else {
            panel.classList.remove('is-active');
          }
        });
      });
    });
  }

  // 2. Render Providers Content (Gemini API Key input)
  const providersList = document.getElementById('pn-settings-providers-list');
  if (providersList) {
    // Get existing API key
    const snapshot = await chrome.storage.local.get(['promptiumGeminiKey']).catch(() => ({}));
    const geminiKey = (snapshot as any).promptiumGeminiKey || '';

    providersList.innerHTML = `
      <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px;">
        <label class="pn-field">
          <span>Gemini API Key</span>
          <input
            id="pn-settings-gemini-key"
            type="password"
            placeholder="AIzaSy..."
            value="${geminiKey}"
            style="width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 8px; border-radius: var(--radius-sm); margin-top: 4px;"
          />
        </label>
        <button id="pn-settings-save-gemini-key" class="pn-btn pn-btn--primary" type="button" style="align-self: flex-start; margin-top: 8px;">
          Save API Key
        </button>
      </div>
    `;

    const saveKeyBtn = document.getElementById('pn-settings-save-gemini-key');
    saveKeyBtn?.addEventListener('click', async () => {
      const input = document.getElementById('pn-settings-gemini-key') as HTMLInputElement | null;
      if (input) {
        const val = input.value.trim();
        await chrome.storage.local.set({ promptiumGeminiKey: val });
        
        const status = document.getElementById('pn-settings-ui-status');
        if (status) {
          status.textContent = 'API Key saved successfully!';
          status.classList.remove('pn-hidden');
          status.style.color = '#4ade80';
          setTimeout(() => status.classList.add('pn-hidden'), 3000);
        }
      }
    });
  }

  // 3. Render Interface Content (Default Refinement Action selection)
  const interfaceContent = document.getElementById('pn-settings-interface-content');
  if (interfaceContent) {
    const settings = await SettingsStore.getSettings({ defaultRefinementAction: 'upgrade' });
    const action = settings.defaultRefinementAction || 'upgrade';

    interfaceContent.innerHTML = `
      <div class="pn-settings-section">
        <h4 class="pn-settings-section-title">Prompt Refinement Settings</h4>
        <p class="pn-settings-section-desc">
          Configure the default action triggered when checking or improving prompts.
        </p>
        
        <label class="pn-field" style="margin-top: 12px;">
          <span>Default Refinement Action</span>
          <select id="pn-settings-default-action" style="width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 8px; border-radius: var(--radius-sm); margin-top: 6px;">
            <option value="fix" ${action === 'fix' ? 'selected' : ''}>Fix (Correct spelling, grammar & rules on-device)</option>
            <option value="upgrade" ${action === 'upgrade' ? 'selected' : ''}>Upgrade (Structure with CRISPE/RISEN patterns offline)</option>
            <option value="rewrite" ${action === 'rewrite' ? 'selected' : ''}>Rewrite (Cloud Gemini rewrite optimization)</option>
          </select>
        </label>
      </div>
    `;

    const selectAction = document.getElementById('pn-settings-default-action') as HTMLSelectElement | null;
    selectAction?.addEventListener('change', async () => {
      const val = selectAction.value as 'fix' | 'upgrade' | 'rewrite';
      const settings = await SettingsStore.getSettings();
      settings.defaultRefinementAction = val;
      await SettingsStore.setSettings(settings);

      const status = document.getElementById('pn-settings-ui-status');
      if (status) {
        status.textContent = 'Refinement settings updated!';
        status.classList.remove('pn-hidden');
        status.style.color = '#4ade80';
        setTimeout(() => status.classList.add('pn-hidden'), 3000);
      }
    });
  }

  // 4. Render Data Content
  const dataContent = document.getElementById('pn-settings-data-content');
  if (dataContent) {
    dataContent.innerHTML = `
      <div class="pn-settings-section">
        <h4 class="pn-settings-section-title">Data Management</h4>
        <p class="pn-settings-section-desc">
          Backup or restore your local prompt library.
        </p>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button class="pn-btn pn-btn--ghost" type="button" id="pn-backup-btn">Export Backup</button>
          <button class="pn-btn pn-btn--ghost" type="button" id="pn-restore-btn">Import Backup</button>
        </div>
      </div>
    `;
  }
};
