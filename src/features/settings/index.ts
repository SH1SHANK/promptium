export * from './api-settings-view';
export * from './appearance-settings-view';
export * from './import-export';
export * from './settings-view';

import * as api from './api-settings-view';
import * as app from './appearance-settings-view';
import * as imex from './import-export';
import * as main from './settings-view';

const SettingsUI = {
  init: async () => {
    await api.loadValidation();
    await main.renderAll();
    app.applyInterfaceSettings({});
  },
  renderAll: main.renderAll,
  syncEmbeddingStatus: async () => {},
  setStatus: () => {},
  switchSection: () => {},
};

if (typeof window !== 'undefined') {
  (window as any).SettingsUI = SettingsUI;
}

export { SettingsUI };
