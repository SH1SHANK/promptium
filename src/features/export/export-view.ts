/**
 * File: features/export/export-view.ts
 * Purpose: Coordinating UI component for the export feature.
 */

export const ExportView = {
  init() {
    if ((window as any).ExportPayloadUI && (window as any).SidepanelState) {
      (window as any).ExportPayloadUI.applyDefaultsFromSettings(
        (window as any).SidepanelState.state.settings
      );
    }
  },
};

if (typeof window !== 'undefined') {
  (window as any).ExportView = ExportView;
}
