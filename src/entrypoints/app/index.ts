// Floating app bundle entry point for Promptium.
import '../../styles/index.css';

import '../../utils/constants';
import '../../utils/dom-helpers';
import '../../utils/pn-dialog';
import '../../utils/tags';
import '../../stores/prompt-store';
import '../../stores/settings-store';
import '../../features/clippings/store';
import '../../utils/prompt-duplicate';
import '../../lib/variables';
import '../../utils/smart-name';
import '../../utils/bridge';
import '../../utils/continuation';
import '../../utils/templates';
import '../../utils/token-counter';
import '../../utils/ai';
import '../../utils/ai-bridge';
import '../../utils/session-storage';
import '../../sidepanel/state';
import '../../features/prompt-library';
import '../../features/templates';
import '../../sidepanel/tags-ui';
import '../../features/settings';
import '../../sidepanel/app-shell-init';

import { initVaultStore } from '../../features/vault/store';
void initVaultStore();
