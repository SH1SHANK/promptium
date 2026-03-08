# Promptium Setup Guide

This document explains how to set up Promptium from source, load it as an unpacked Chrome extension, and verify that the main flows work.

Promptium is a Manifest V3 Chrome extension. There is no backend service to run. Most of the repository is plain JavaScript, HTML, and CSS loaded directly by the extension. The only build step in the current repo is generating the side panel Tailwind stylesheet.

## Who This Is For

Use this guide if you are:

- developing Promptium from source
- loading the extension locally for testing
- verifying AI-provider setup and semantic search behavior

If you only want a quick install summary, see the repository README. This file is the detailed version.

## What You Need

Before starting, make sure you have:

- a Chromium-based browser with Chrome extension developer mode available
- Git
- Node.js installed
- `pnpm` available locally

This repo is pinned to `pnpm@8.9.0` in [../../package.json](../../package.json). Using a recent Node LTS release is the safest choice.

### macOS Notes

This workspace is currently being used on macOS. If dependency installation fails while building native modules such as `canvas`, install Xcode Command Line Tools first:

```bash
xcode-select --install
```

## Repository Layout You Should Know

These are the directories most relevant during setup:

- `manifest.json`: extension entrypoint, permissions, content scripts, side panel registration
- `background/`: Manifest V3 service worker
- `content/`: injected UI on supported chat sites, including the floating action button and export selection UI
- `sidepanel/`: main Promptium workspace UI
- `popup/`: onboarding and popup surface
- `utils/`: shared platform, storage, AI, export, and parsing logic
- `src/input.css`: Tailwind input file for the side panel
- `sidepanel/tailwind.css`: generated Tailwind output used by the extension
- `libs/`: vendored browser-side libraries such as `jspdf` and `transformers`

## Setup Path 1: Developer From Source

### 1. Clone the Repository

```bash
git clone https://github.com/SH1SHANK/promptium.git
cd promptium
```

If you already have the repo, move into the workspace root.

### 2. Install Dependencies

```bash
pnpm install
```

What this installs now:

- `tailwindcss` for side panel stylesheet generation
- `canvas` as a development dependency used by the project environment
- `jspdf` as a package dependency

There is no frontend bundler configured in the current `package.json`. Most source files are loaded directly by the extension via `manifest.json`.

### 3. Build the Side Panel CSS

Run the current build script once:

```bash
pnpm build:sidepanel-css
```

This compiles:

- input: `src/input.css`
- output: `sidepanel/tailwind.css`

If you are actively editing side panel styling, keep the watcher running in a separate terminal:

```bash
pnpm watch:sidepanel-css
```

### 4. Load the Extension in Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the repository root folder
5. Confirm the extension appears as Promptium

Load the repository root, not an inner folder. Chrome needs `manifest.json` at the top level.

### 5. Pin and Open Promptium

After the extension loads:

1. Pin Promptium from the extensions toolbar if you want quick access
2. Open a supported AI site such as ChatGPT or Claude
3. Use `Alt+P` to open the side panel

The command is defined in [../../manifest.json](../../manifest.json) and mapped for macOS as `Alt+P`.

### 6. Understand the Dev Reload Workflow

Promptium is not running through a dev server. Your normal edit loop is:

1. change source files in the repo
2. rebuild CSS if you changed `src/input.css`
3. return to `chrome://extensions`
4. click Reload on the Promptium extension card
5. refresh the target site if content scripts or injected UI changed

Use this rule of thumb:

- if you changed `manifest.json`, always reload the extension
- if you changed files in `background/`, reload the extension
- if you changed files in `content/`, reload the extension and refresh the site tab
- if you changed files in `sidepanel/`, reload the extension and reopen the side panel if needed
- if you changed `src/input.css`, rerun or keep running the Tailwind build, then reload the extension

## Setup Path 2: Local Tester or End User

If you are not modifying the code and only want to run Promptium locally:

### 1. Get the Repository

Clone or download the repository, then open the root folder.

### 2. Install Dependencies and Build CSS Once

Even for local testing, the generated side panel CSS should exist and be current.

```bash
pnpm install
pnpm build:sidepanel-css
```

### 3. Load the Unpacked Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the Promptium repository root

### 4. Open a Supported Platform

Promptium activates only on supported AI sites listed in [../../manifest.json](../../manifest.json). Examples include:

- `chatgpt.com`
- `claude.ai`
- `gemini.google.com`
- `copilot.microsoft.com`
- `perplexity.ai`

The extension will not inject its in-page controls on unrelated websites.

### 5. Open the Side Panel

Use one of these paths:

- press `Alt+P`
- click the extension action if your browser exposes the side panel entry

### 6. Complete First-Run Configuration

Open Settings inside Promptium and configure the features you plan to use.

## First-Run Configuration

### AI Provider Setup

Promptium supports AI-powered features through user-supplied provider keys. Current providers described in the repo docs are:

- Gemini
- OpenAI
- Anthropic
- OpenRouter

To configure one:

1. open the side panel
2. go to Settings
3. choose a provider
4. paste your API key
5. save

Important behavior:

- API keys are stored in `chrome.storage.session`, not persistent local storage
- keys are cleared when the browser session ends
- requests go directly to the selected provider endpoint
- if the active provider is unavailable, Promptium can fall back through other configured providers

### Semantic Search Model Setup

Promptium uses a local embedding model for semantic search. On first semantic-search use, the extension may download model assets in the browser.

What to expect:

- first run is slower than later runs
- model files are local to the extension/browser environment after download
- semantic search works on-device
- if model loading fails or the environment is unsuitable, Promptium falls back to keyword search behavior

This local-model behavior is documented further in [../reference/LOCALMODELS.md](../reference/LOCALMODELS.md).

## What Promptium Runs Where

This helps when you are debugging setup issues.

- Service worker: [../../background/service_worker.js](../../background/service_worker.js)
  Initializes storage, opens the side panel, routes AI requests, manages embeddings.
- Content scripts: files under [../../content](../../content)
  Inject the floating action button, scrape chats, handle bookmarks, and interact with supported AI pages.
- Side panel: files under [../../sidepanel](../../sidepanel)
  Main UI for prompts, history, export, continuation, settings, and search.
- Popup: files under [../../popup](../../popup)
  Onboarding and entry UI from the extension icon.

If something is not visible on the page, it is usually a content-script injection issue, a site refresh issue, or a platform selector issue rather than a build failure.

## Basic Validation Checklist

After setup, verify these flows in order.

### Validation 1: Extension Loads Cleanly

Confirm that:

- Promptium appears in `chrome://extensions`
- there are no immediate load failures
- the extension can be reloaded without errors

### Validation 2: Side Panel Opens

On a supported AI site:

- press `Alt+P`
- confirm the Promptium side panel opens
- verify the UI renders instead of a blank panel

### Validation 3: Floating Action Button Appears

On a supported conversation page:

- wait for the page to finish rendering
- confirm the floating action button appears

If it does not appear, reload the extension first, then refresh the page.

### Validation 4: Save a Prompt

Try a simple prompt save flow:

1. enter text into a supported chat composer
2. use the Promptium save flow
3. confirm the prompt appears in the library

This validates content-script capture, storage, and side panel rendering.

### Validation 5: Export a Conversation

Try the export flow:

1. open the export UI
2. select messages
3. export to Markdown or JSON first

Markdown and JSON are the fastest formats to verify because they avoid image/PDF-specific rendering concerns.

### Validation 6: AI Features Work

After adding an API key:

- try Improve or Polish on a prompt
- confirm a response is returned
- if the first provider fails, verify whether another configured provider succeeds

### Validation 7: Semantic Search Works

After saving a few prompts:

- perform a normal keyword search
- perform a semantic-style query
- confirm the search stays responsive after the initial model load

## Common Troubleshooting

### `pnpm install` Fails

Possible causes:

- missing Node.js
- missing `pnpm`
- native module toolchain issues on macOS for `canvas`

Try:

```bash
node -v
pnpm -v
xcode-select --install
pnpm install
```

### Side Panel Styles Look Broken

The generated CSS may be missing or stale.

Rebuild it:

```bash
pnpm build:sidepanel-css
```

Then reload the extension.

### Changes Are Not Showing Up

Promptium does not hot-reload automatically.

Make sure you:

1. rebuilt CSS if needed
2. clicked Reload in `chrome://extensions`
3. refreshed the target page if content scripts are involved

### FAB or Injected Controls Do Not Appear

Check these first:

- you are on a supported host
- the extension was reloaded after code changes
- the page itself was refreshed
- the site DOM did not change in a way that broke selectors

Platform-specific selectors live in [../../utils/platform.js](../../utils/platform.js).

### AI Features Fail After Browser Restart

This can be expected if your key was only stored in session storage.

Promptium intentionally keeps API keys in browser session memory. Re-enter the key in Settings after a fresh browser session if required.

### Semantic Search Is Slow the First Time

This is expected on first model load. The extension may need to download local model assets before embeddings are available.

If model setup fails, Promptium should still remain usable through keyword search fallback.

### The Extension Loads But a Feature Seems Missing

Some features depend on:

- being on a supported platform
- opening the side panel first
- having an AI provider configured
- having saved prompts or selected chat messages available

Verify the precondition for the specific feature before assuming setup is broken.

## Permissions and Storage Expectations

Promptium is designed to run locally.

- persistent app data is stored in browser local storage
- API keys are stored in session storage
- content scripts run only on supported AI domains declared in the manifest
- there is no Promptium backend service to configure

For deeper reference, see:

- [../reference/PERMISSIONS.md](../reference/PERMISSIONS.md)
- [../reference/STORAGE.md](../reference/STORAGE.md)
- [../reference/ARCHITECTURE.md](../reference/ARCHITECTURE.md)

## Recommended Developer Workflow

For day-to-day development, this is the shortest reliable loop:

1. run `pnpm watch:sidepanel-css` if you are touching side panel styles
2. edit files in the repo
3. reload the extension in Chrome
4. refresh the active AI site tab if content scripts changed
5. verify behavior from the side panel and in-page UI

## Current Build Reality

At the time of writing, the repository does not expose a general `build`, `dev`, or `test` script in [../../package.json](../../package.json). The only declared scripts are:

- `build:sidepanel-css`
- `watch:sidepanel-css`

That means setup for this project is mostly extension loading and targeted asset generation, not a traditional web-app compile pipeline.

## Setup Complete When

You can consider setup complete when all of the following are true:

- dependencies install successfully
- `sidepanel/tailwind.css` is generated
- Chrome loads the unpacked extension from the repo root
- the side panel opens on a supported AI site
- at least one core action works, such as saving a prompt or exporting chat content
- AI-powered features work after you configure a provider key

If you need a high-level product overview after setup, return to [../../README.md](../../README.md).
