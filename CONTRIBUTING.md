# Contributing to Promptium

This document explains how to contribute safely and consistently to Promptium.

## Before You Start

Read these first:

- [README.md](./README.md)
- [docs/guides/SETUP.md](./docs/guides/SETUP.md)
- [docs/reference/ARCHITECTURE.md](./docs/reference/ARCHITECTURE.md)

Promptium is a Manifest V3 browser extension with no backend service. Most changes are validated by rebuilding the side panel stylesheet, reloading the unpacked extension, and manually verifying the affected flow.

## Development Setup

1. Follow the setup guide in [docs/guides/SETUP.md](./docs/guides/SETUP.md).
2. Install dependencies with `pnpm install`.
3. Build styles with `pnpm build:sidepanel-css`.
4. Load the repository root as an unpacked extension in Chrome.

If you are working on side panel styling, keep `pnpm watch:sidepanel-css` running.

## Scope Your Changes

Keep pull requests focused.

- avoid mixing documentation-only changes with unrelated product behavior changes
- avoid broad refactors unless the task requires them
- prefer fixing the root cause instead of patching symptoms
- preserve existing behavior unless the change is intentional and documented

## Code Style Expectations

- keep changes minimal and consistent with the surrounding code
- prefer plain, readable JavaScript over unnecessary abstraction
- do not reformat unrelated files
- update documentation when behavior, configuration, or setup changes
- keep user-facing text explicit and accurate

## Validation Expectations

There is currently no full automated test pipeline declared in `package.json`, so contributors should validate changes proportionally.

For most changes:

1. run `pnpm build:sidepanel-css` if styling or side panel CSS inputs changed
2. reload the extension in `chrome://extensions`
3. refresh the affected page if content scripts are involved
4. manually verify the impacted flow

Examples:

- content script changes: verify on a supported AI platform page
- side panel changes: verify rendering, settings, and interaction flow
- AI-provider changes: verify key validation or fallback behavior where possible
- local-model changes: verify semantic search initialization and keyword fallback behavior
- docs changes: verify links and file locations

## Pull Request Guidance

When opening a PR, include:

- a short problem statement
- the intended behavior after the change
- any important tradeoffs or limitations
- the manual validation you performed

If your change affects permissions, storage, AI providers, setup, or user workflows, update the relevant docs under [docs](./docs/README.md).

## Documentation Layout

Promptium documentation is grouped to reduce root-level clutter:

- guides in `docs/guides/`
- reference material in `docs/reference/`
- project history in `docs/project/`

Standard project files remain in the repository root:

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `LICENSE.md`

## Security-Related Changes

If your change affects:

- API key handling
- host permissions
- content-script injection behavior
- storage of prompts, chat history, or exports
- outbound provider requests

review [SECURITY.md](./SECURITY.md) before opening the PR.

## Questions and Proposals

If a change is large, architectural, or changes user-facing workflow, document the approach clearly before expanding the scope. Small, well-defined changes are easier to review and safer to merge.
