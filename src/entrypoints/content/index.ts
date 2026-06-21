// Content script entry point for Promptium WXT migration
import '../../utils/constants';
import '../../utils/dom-helpers';
import '../../utils/tags';
import '../../utils/platform';
import '../../stores/prompt-store';
import '../../stores/settings-store';
import '../../stores/bookmark-store';
import '../../lib/variables';
import '../../utils/smart-name';
import '../../utils/bridge';
import '../../utils/continuation';
import '../../utils/templates';
import '../../content/scraper';
import '../../content/injector';
import '../../content/toolbar';
import '../../content/bookmarks';
import '../../content/suggestions';
import '../../content/content';

import './fab.css';
import './toolbar.css';

export default defineContentScript({
  matches: [
    '*://*.chatgpt.com/*',
    '*://*.claude.ai/*',
    '*://gemini.google.com/*',
    '*://*.perplexity.ai/*',
    '*://copilot.microsoft.com/*',
  ],
  runAt: 'document_idle',
  main() {
    // No-op - side effects are executed by imports
  },
});
