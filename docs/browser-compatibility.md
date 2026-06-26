# Browser Compatibility Matrix - Floating Window

This document outlines the validation matrix for Promptium's Floating Window across major Chromium-based browsers.

| Browser     | Window Open | Focus (Bring to Front) | Restore Bounds | Persist Bounds | Notes                                   |
| :---------- | :---------: | :--------------------: | :------------: | :------------: | :-------------------------------------- |
| **Chrome**  |     Yes     |          Yes           |      Yes       |      Yes       | Reference standard behavior.            |
| **Arc**     |     Yes     |          Yes           |      Yes       |      Yes       | Fits alongside Arc's vertical tab bar.  |
| **Brave**   |     Yes     |          Yes           |      Yes       |      Yes       | Verified under strict shields.          |
| **Edge**    |     Yes     |          Yes           |      Yes       |      Yes       | Coordinates match standard offsets.     |
| **Vivaldi** |     Yes     |          Yes           |      Yes       |      Yes       | Correctly respects minimal popup sizes. |
| **Opera**   |     Yes     |          Yes           |      Yes       |      Yes       | Focus behaves identically.              |

## Lifecycle Tests Matrix

### 1. Window Creation & Restoration

- Opening window via the extension action icon.
- Resizing/moving window to check if bounds are stored in extension storage.
- Closing window and reopening to verify stored dimensions are preferred.

### 2. Multi-instance Protection

- Clicking the extension icon while the window is already active must trigger a window focus.
- Verifies `chrome.windows.update` is resolved correctly on the active ID.

### 3. MV3 Service Worker Termination

- Trigger background script termination/extension reload.
- Click the extension icon. Stale window IDs must be verified and cleared automatically via `chrome.windows.get()`, preventing duplicate windows.
