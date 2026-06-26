/**
 * File: features/context-menu/context-menu.test.ts
 * Purpose: Contract validation tests for the Promptium Context Menu action system.
 *          Runs under Node.js via tsx.
 */

import * as actions from './actions';
import * as messages from './messages';
import { handleContextMenuClick } from './handlers';

let failed = false;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`✗ Assertion Failed: ${message}`);
    failed = true;
  } else {
    console.log(`✓ Passed: ${message}`);
  }
}

console.log('Running context menu action system contract validation...');

// 1. Validate unique action constants
const actionValues = [
  actions.OPEN_PROMPTIUM,
  actions.FIX_PROMPT,
  actions.UPGRADE_PROMPT,
  actions.REWRITE_PROMPT,
  actions.SAVE_TO_VAULT,
  actions.COPY_AS_PROMPT,
  actions.CONTINUE_CHAT,
];

const uniqueActions = new Set(actionValues);
assert(
  uniqueActions.size === actionValues.length,
  `Action constants must be unique. Found: ${JSON.stringify(actionValues)}`
);

// 2. Validate message constants
assert(messages.GET_SELECTION === 'GET_SELECTION', 'GET_SELECTION message is correct.');
assert(messages.SHOW_TOAST === 'SHOW_TOAST', 'SHOW_TOAST message is correct.');
assert(messages.COPY_TO_CLIPBOARD === 'COPY_TO_CLIPBOARD', 'COPY_TO_CLIPBOARD message is correct.');

// 3. Verify handlers router maps all actions
const mockInfo = (menuItemId: string): chrome.contextMenus.OnClickData =>
  ({
    menuItemId,
    editable: false,
    modifiers: [],
    pageUrl: 'https://example.com',
  }) as any;

assert(
  typeof handleContextMenuClick === 'function',
  'handleContextMenuClick router function is exported.'
);

// Check that calling the router with an invalid key logs warning but doesn't throw
try {
  const consoleWarnSpy = console.warn;
  let warned = false;
  console.warn = (msg: string) => {
    if (msg.includes('Unhandled context menu action')) {
      warned = true;
    }
  };
  void handleContextMenuClick(mockInfo('invalid-action'));
  console.warn = consoleWarnSpy;
  assert(warned, 'Router warns on unhandled action.');
} catch (err: any) {
  assert(false, `Router threw error on unhandled action: ${err.message}`);
}

import { contextMenuRegistry } from './menu-registry';
import { CONTINUE_CHAT } from './actions';
import { updateContextMenuTitles } from './logic';

// Mock chrome globals for contract testing
let updatedMenuId = '';
let updatedProperties: any = null;

(globalThis as any).chrome = {
  tabs: {
    sendMessage: async (tabId: number, message: any) => {
      if (tabId === 1) return { ok: true, healthy: true };
      if (tabId === 2) return { ok: true, healthy: false };
      throw new Error('Tab error');
    },
  },
  contextMenus: {
    update: async (id: string, properties: any) => {
      updatedMenuId = id;
      updatedProperties = properties;
      recordedUpdates[id] = properties;
    },
  },
} as any;

const recordedUpdates: Record<string, any> = {};

// Run contract validations
void (async () => {
  await contextMenuRegistry.updateContinueChatVisibility(1);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(
    updatedMenuId === CONTINUE_CHAT && updatedProperties?.visible === true,
    'Continue Chat is visible for healthy adapter.'
  );

  await contextMenuRegistry.updateContinueChatVisibility(2);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(
    updatedMenuId === CONTINUE_CHAT && updatedProperties?.visible === false,
    'Continue Chat is hidden for unhealthy adapter.'
  );

  await contextMenuRegistry.updateContinueChatVisibility(3);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(
    updatedMenuId === CONTINUE_CHAT && updatedProperties?.visible === false,
    'Continue Chat is hidden on error/unsupported page.'
  );

  // 4. Validate dynamic context menu updates based on selection type (code vs text)
  await updateContextMenuTitles(true); // selection is code
  assert(
    recordedUpdates['pn-fix-prompt']?.title === 'Improve Code Prompt',
    'Fix Prompt updates to Improve Code Prompt when code is selected.'
  );
  assert(
    recordedUpdates['pn-upgrade-prompt']?.title === 'Generate Agent Prompt',
    'Upgrade Prompt updates to Generate Agent Prompt when code is selected.'
  );

  await updateContextMenuTitles(false); // selection is plain text
  assert(
    recordedUpdates['pn-fix-prompt']?.title === 'Fix Prompt',
    'Fix Prompt updates to Fix Prompt when plain text is selected.'
  );
  assert(
    recordedUpdates['pn-upgrade-prompt']?.title === 'Upgrade Prompt',
    'Upgrade Prompt updates to Upgrade Prompt when plain text is selected.'
  );

  if (failed) {
    console.error('\nContext menu action system contract validation failed.');
    process.exit(1);
  } else {
    console.log('\nAll context menu contracts validated successfully.');
    process.exit(0);
  }
})();
