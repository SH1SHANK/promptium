interface Window {
  [key: string]: any;
}

declare var Window: {
  prototype: Window;
  new (): Window;
};

// Declared globals for legacy global scripts compatibility
declare var showToast: any;
declare var getActiveTabContext: any;
declare var PLATFORM_LABELS: any;
declare var SUPPORTED_URLS: any;
