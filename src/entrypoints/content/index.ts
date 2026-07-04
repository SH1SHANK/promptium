/// <reference path="../../shared/types/window.d.ts" />
// Content script entry point — Promptium
import '../../shared/utils/constants';
import '../../shared/utils/dom-helpers';
import '../../platform/index';
import '../../prompt/storage/storage';
import '../../shared/storage/settings-store';
import '../../prompt/variables/index';
import '../../shared/utils/prompt-parser';
import '../../content/scraper';
import '../../content/injector';

import '../../prompt/fab/fab.css';
import './toolbar.css';
import { fabManager } from '../../prompt/fab/fab-manager';
import { init } from '../../content/controller';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    fabManager.initialize();
    void init();
  },
});
