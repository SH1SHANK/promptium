// Content script entry point for Promptium WXT migration
import '../../utils/constants';
import '../../utils/dom-helpers';
import '../../utils/tags';
import '../../platforms/index';
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
import '../../content/bookmarks';
import '../../content/suggestions';
import '../../content/content';

import '../../features/fab/fab.css';
import './toolbar.css';
import { fabManager } from '../../features/fab';

export default defineContentScript({
  matches: [
    '<all_urls>',
  ],
  runAt: 'document_idle',
  main() {
    fabManager.initialize();
  },
});
