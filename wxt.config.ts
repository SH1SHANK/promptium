import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'Promptium',
    short_name: 'Promptium',
    description: 'Local-first Gemini prompt manager with a floating power-user workspace.',
    version: '0.1.0',
    icons: {
      '16': 'icons/promptium/icon16.png',
      '32': 'icons/promptium/icon32.png',
      '48': 'icons/promptium/icon48.png',
      '128': 'icons/promptium/icon128.png',
    },
    action: {
      default_icon: {
        '16': 'icons/promptium/icon16.png',
        '32': 'icons/promptium/icon32.png',
      },
      default_title: 'Promptium',
    },
    permissions: ['storage', 'windows', 'downloads', 'contextMenus'],
    commands: {
      'open-side-panel': {
        suggested_key: {
          default: 'Alt+P',
          mac: 'Alt+P',
        },
        description: 'Open Promptium window',
      },
    },
    host_permissions: [
      '*://*.chatgpt.com/*',
      '*://*.claude.ai/*',
      '*://gemini.google.com/*',
      '*://*.perplexity.ai/*',
      '*://copilot.microsoft.com/*',
      'https://generativelanguage.googleapis.com/*',
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; style-src 'self'; font-src 'self' data:",
    },
    browser_specific_settings: {
      gecko: {
        strict_min_version: '109.0',
      },
    },
    web_accessible_resources: [],
  },
});
