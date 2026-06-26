# Bundle Analysis — F4.5

Generated: 2026-06-23

## Why this analysis exists

Promptium’s performance bottleneck has evolved from “too much code in content scripts” to “too much feature code reachable from the app shell.” Bundle analysis exists to keep that boundary explicit: the initial floating window should load shell code first, then feature modules only when the user opens those workflows.

## Reproduction

```bash
pnpm build
du -h .output/chrome-mv3/app.html .output/chrome-mv3/background.js .output/chrome-mv3/content-scripts/content.js .output/chrome-mv3/chunks/*.js | sort -h
rg -n "harper|fuse|compromise|tiktoken|getHarper|getFuse|getCompromise|getTokenizer|import\\(" src/features src/utils src/entrypoints src/sidepanel --glob '!lib/**'
rg -n "side_panel|default_path" .output/chrome-mv3/manifest.json
```

## Current production output

| Artifact                                           | Size from `du -h` | Role                                             |
| -------------------------------------------------- | ----------------: | ------------------------------------------------ |
| `.output/chrome-mv3/app.html`                      |               52K | Floating app document.                           |
| `.output/chrome-mv3/background.js`                 |               60K | MV3 service worker.                              |
| `.output/chrome-mv3/content-scripts/content.js`    |               92K | Cross-platform page bridge and export selection. |
| `.output/chrome-mv3/chunks/app-B8Qd0ARc.js`        |              100K | Main app runtime chunk.                          |
| `.output/chrome-mv3/chunks/refinement-BRWOneSE.js` |               56K | Refinement workspace.                            |
| `.output/chrome-mv3/chunks/vault-ui-BRd0Za1V.js`   |               24K | Vault UI.                                        |
| `.output/chrome-mv3/chunks/fuse-CnS75vYB.js`       |               28K | Fuse.js lazy chunk.                              |
| `.output/chrome-mv3/chunks/compromise-DJJWHVi0.js` |                4K | Compromise wrapper lazy chunk.                   |
| `.output/chrome-mv3/chunks/tokenizer-CpOQ7rAZ.js`  |                4K | Tiktoken wrapper lazy chunk.                     |
| `.output/chrome-mv3/chunks/jspdf.min-DqUgGxXD.js`  |              392K | PDF export lazy chunk.                           |
| `.output/chrome-mv3/chunks/dist-CyKoXtLk.js`       |              5.3M | Harper/runtime dependency chunk.                 |

## Lazy-load boundaries

| Capability             | Boundary | Evidence                                                                                             |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Harper                 | Lazy     | `analyzer.ts` imports `harper.js` only inside `getHarperLinter()`.                                   |
| Fuse                   | Lazy     | `intelligence-loader.ts` imports `fuse.js` inside `getFuse()`.                                       |
| Compromise             | Lazy     | `intelligence-loader.ts` imports `compromise`; retrieval imports the wrapper dynamically.            |
| Tiktoken               | Lazy     | `intelligence-loader.ts` imports `js-tiktoken`; retrieval imports the tokenizer wrapper dynamically. |
| Vault UI               | Lazy     | `app-shell-init.ts` imports `../features/vault/vault-ui` when the Vault workflow opens.              |
| Export preview/service | Lazy     | `app-shell-init.ts` imports export modules when export workflow opens.                               |
| Refinement             | Lazy     | `app-shell-init.ts` imports `../features/refinement` when refinement opens.                          |

## Manifest check

The current production manifest does not emit `side_panel`. The active shell is the floating app window, with permissions limited to storage, windows, downloads, and context menus plus explicit host permissions.

Runnable check:

```bash
rg -n "side_panel" .output/chrome-mv3/manifest.json
```

Expected result: no matches.

## Tradeoffs

| Option                                  | Benefit                                          | Cost                                                                           | Decision                                                    |
| --------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Aggressively split every feature file   | Smaller chunks on paper.                         | More network/module startup overhead inside MV3 and more brittle import graph. | Avoid unless a chunk demonstrably blocks first interaction. |
| Keep coarse feature chunks              | Stable mental model and fewer waterfall imports. | Some workflows load more than one screen’s code.                               | Current default.                                            |
| Replace Harper with smaller local rules | Large bundle reduction.                          | Worse grammar diagnostics.                                                     | Not in F4.5 because it changes quality behavior.            |

## Next optimization target

The large `dist-CyKoXtLk.js` chunk is the main size risk. It is acceptable only while Harper remains fully lazy. Any static import path that pulls Harper into the initial app/background/content bundle should be treated as a regression.
