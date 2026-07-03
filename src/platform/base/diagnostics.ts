export interface AdapterDiagnostics {
  adapter: string;
  version: string;
  healthy: boolean;
  supported: boolean;
  selectors: {
    composer: boolean;
    messages: boolean;
  };
}
