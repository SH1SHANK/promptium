# Code Audit Report — F4.5

Generated: 2026-06-23

## Why this audit exists

Promptium now has stable feature pillars: Vault, importer, retrieval, refinement, context menus, and the floating app window. At this stage, the highest-risk technical debt is not missing functionality; it is stale compatibility code loading in the wrong bundle, duplicate architectural patterns, and undocumented lazy-loading boundaries. The audit exists to keep future feature work from growing around obsolete paths.

## Reproduction

```bash
pnpm knip --exclude exports,types,nsExports,nsTypes,classMembers,enumMembers,duplicates,unlisted,binaries
pnpm typecheck
rg -n "console\\.(log|warn|error|debug|info)" src --glob '!lib/**'
rg -n "from .*intelligence/cre|retrieveContext" src --glob '!features/refinement/intelligence/cre/**'
```

## Removed files

| File                                                | Reason                                                                                                                                     | Behavior impact                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/features/refinement/intelligence/cre/index.ts` | Unused barrel export reported by Knip. The rewrite flow now imports the provider-backed retrieval pipeline from `src/features/retrieval/`. | None. The old CRE engine and test remain available until the legacy test path is intentionally retired. |

## Removed exports

| Export                                                                      | Reason                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| CRE barrel exports from `src/features/refinement/intelligence/cre/index.ts` | No source import consumed the barrel. Keeping it made the deprecated CRE path look like public architecture. |

## Dependencies reviewed

| Dependency              | Current status                                                          | Lazy-load boundary                                                                                                |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `harper.js`             | Retained. Used by prompt analysis.                                      | `src/features/refinement/intelligence/analyzer.ts` dynamic imports `harper.js` and `harper.js/binary`.            |
| `fuse.js`               | Retained. Used by recommendation/search and old CRE compatibility path. | `src/features/refinement/intelligence/loaders/intelligence-loader.ts`.                                            |
| `compromise`            | Retained. Used for intent extraction.                                   | `src/features/refinement/intelligence/loaders/intelligence-loader.ts`; retrieval imports the wrapper dynamically. |
| `js-tiktoken`           | Retained. Used for token budgeting.                                     | `src/features/refinement/intelligence/loaders/intelligence-loader.ts`; retrieval imports the wrapper dynamically. |
| `jspdf` vendored bundle | Retained. Used by export flows.                                         | Current production output isolates it in `chunks/jspdf.min-*.js`.                                                 |

## Logging consolidation

Created `src/core/logger/index.ts`.

Production paths migrated in this pass:

- Vault storage initialization.
- Floating-window creation.
- Window state persistence.
- Compromise intent fallback.
- Tiktoken fallback.
- Fuse search fallback.

Runnable example:

```ts
import { createLogger } from '../core/logger';

const logger = createLogger('ExampleScope');
logger.warn('Storage read failed; using fallback state.', error);
```

## Correctness fixes discovered during audit

| Area                      | Issue                                                                                                                              | Fix                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault revision            | `initVaultStore()` read `promptium_vault_revision` from the result object without requesting that key from `chrome.storage.local`. | Storage initialization now requests both Vault items and Vault revision.                                                                                                                     |
| Pinned retrieval overflow | Large pinned knowledge bypassed compression, which could drop pins earlier than necessary.                                         | Knowledge section compression now applies to pinned items too.                                                                                                                               |
| Pinned budget precedence  | Pinned/manual/retrieved candidates were collected and then regrouped by type, weakening the intended budget order.                 | Budgeting now applies notes, pinned, manual, high-priority retrieved instructions, retrieved skill, retrieved medium instructions, retrieved knowledge, retrieved low-priority instructions. |

## Knip result

After the source cleanup, Knip should only report configuration hints unless future stale files are added.

Known configuration hints from the run:

- `.wxt/**`, `.output/**`, and `node_modules/**` are ignored explicitly.
- `autoprefixer` is listed as an ignored dependency.
- `tailwind.config.js` and `postcss.config.js` are redundant entry patterns.

These are not runtime dead code and were left unchanged because they describe audit configuration, not Promptium source architecture.

## Estimated bundle savings

The removed CRE barrel is source-level cleanup with negligible direct byte savings. The durable savings comes from preserving lazy import boundaries: Compromise, Tiktoken, Fuse, Harper, importers, export preview, and refinement continue to avoid the initial app path until invoked.

## Edge cases

- The old CRE engine remains because `pnpm test:cre` still validates its compatibility path. Removing it should happen with a separate migration that deletes the test script and any compatibility requirement together.
- Logger calls still write to `console.*` internally. That is intentional for MV3 service worker visibility; the consolidation point is the logger interface, not suppression.
