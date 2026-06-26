# Test Coverage Report — F4.5

Generated: 2026-06-23

## Why this report exists

Promptium’s most failure-prone areas are boundary code: Chrome APIs, storage migrations, import parsing, context-menu actions, retrieval budgeting, and rewrite preparation. Coverage reporting exists to identify which behavior is executable today and which behavior still relies on manual testing.

## Runnable test commands

```bash
pnpm typecheck
pnpm lint
pnpm test:adapters
pnpm test:context-menu
pnpm test:importer
pnpm test:cre
pnpm test:retrieval
pnpm build
```

The aggregate command is:

```bash
pnpm verify
```

## Current executable coverage

| Area                  | Command                  | Coverage                                                                                                                |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Platform adapters     | `pnpm test:adapters`     | Adapter contract validation.                                                                                            |
| Context menus         | `pnpm test:context-menu` | Menu registration/action contract behavior.                                                                             |
| Vault importer        | `pnpm test:importer`     | Importer parsing and conversion behavior.                                                                               |
| Legacy CRE            | `pnpm test:cre`          | Compatibility coverage for the deprecated retrieval engine path.                                                        |
| F4 retrieval pipeline | `pnpm test:retrieval`    | 50 deterministic retrieval scenarios with expected selected IDs, source attribution, and Supabase RLS section metadata. |
| Type safety           | `pnpm typecheck`         | Whole-project TypeScript compilation.                                                                                   |
| Linting               | `pnpm lint`              | Static code quality checks.                                                                                             |
| Production packaging  | `pnpm build`             | WXT MV3 build and chunk generation.                                                                                     |

## Untested or under-tested paths

| Area                      | Gap                                                                                                 | Recommended next test                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Vault operations          | Create/update/delete/toggle revision increments are not isolated in a dedicated store test.         | Add `src/features/vault/store.test.ts` with mocked `chrome.storage.local`.              |
| Retrieval UI overlay      | Manual add/remove context behavior is not DOM-tested.                                               | Add a browser-like DOM test for Context Used overlay rebudgeting.                       |
| Import UI errors          | Parser tests exist, but file picker and URL import UI failures are manual.                          | Add UI-level tests around import error state rendering.                                 |
| Floating window lifecycle | Service behavior exists but no dedicated unit test asserts reuse/focus/clear-stale-window behavior. | Add mocked `chrome.windows` tests for `FloatingWindowService`.                          |
| Settings persistence      | Settings flows are mostly manual.                                                                   | Add store-level tests for API key/model/appearance persistence.                         |
| Small-window layout       | No visual regression test.                                                                          | Add screenshot-based smoke checks at 600/700/800px after a browser test harness exists. |

## Regression benchmark coverage

The retrieval benchmark is intentionally scenario-based rather than purely unit-based. It catches product regressions that unit tests miss, such as a Supabase prompt selecting generic SaaS material, or a pinned TypeScript instruction losing its source attribution.

Runnable example:

```bash
pnpm test:retrieval
```

Expected output:

```text
Passed 50 retrieval scenarios.
```

## Edge cases

- Console output in test files remains direct because test runners need simple process output.
- The legacy CRE test remains until the deprecated engine is formally removed from verification.
- Retrieval benchmark cases are stable and deterministic, but not a substitute for qualitative prompt-rewrite evaluation.
