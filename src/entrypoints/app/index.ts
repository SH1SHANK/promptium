/// <reference path="../../shared/types/window.d.ts" />
// Floating app bundle entry point for Promptium.
import '../../shared/styles/index.css';

import '../../shared/utils/constants';
import '../../shared/utils/dom-helpers';
import '../../shared/utils/pn-dialog';
import '../../shared/utils/toast';
import '../../shared/utils/keyboard-shortcuts';
import '../../prompt/storage/storage';
import '../../shared/storage/settings-store';
import '../../shared/utils/prompt-duplicate';
import '../../prompt/variables/index';
import '../../shared/utils/prompt-parser';
import '../../shared/utils/session-storage';
import '../../prompt/state/state';
import '../../prompt/library/library';
import '../../prompt/builder/builder';
import '../../prompt/library/tags-ui';
import '../../app/shell';
