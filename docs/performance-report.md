# Performance Report — F4.5

Generated: 2026-06-23

## Why this report exists

Promptium is a local-first browser extension. Perceived speed depends less on network latency and more on avoiding unnecessary module loading, storage reads, tokenization, and ranking work on the critical path. Performance reporting exists to preserve warm-operation targets as the Vault grows.

## Targets

| Operation       | Warm target |
| --------------- | ----------: |
| Retrieval       |   `< 150ms` |
| Vault search    |    `< 50ms` |
| Refinement open |   `< 100ms` |

## Implemented performance safeguards

| Safeguard                         | Mechanism                                                                                       | Why it matters                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Retrieval analysis cache          | Normalized prompt hash to analysis result.                                                      | Avoids repeated Compromise/Tiktoken work for identical prompts.        |
| Retrieval result cache            | Normalized prompt hash plus `vaultRevision`.                                                    | Avoids repeated ranking/budgeting while Vault state is unchanged.      |
| Vault revision persistence        | `promptium_vault_revision` increments after create, update, delete, toggle, and import commits. | Prevents stale retrieval cache hits after Vault mutations.             |
| Lazy intelligence imports         | Dynamic imports for Compromise, Fuse, Tiktoken, and Harper.                                     | Keeps expensive intelligence libraries off first app load.             |
| Deterministic section compression | Large knowledge entries are reduced to relevant sections before budgeting.                      | Prevents oversized documents from crowding out smaller useful context. |

## Measurement commands

```bash
pnpm build
pnpm test:retrieval
pnpm test:importer
du -h .output/chrome-mv3/app.html .output/chrome-mv3/background.js .output/chrome-mv3/content-scripts/content.js .output/chrome-mv3/chunks/*.js | sort -h
```

## In-app timing surfaces

Retrieval diagnostics now track:

- retrieval duration;
- ranking duration field;
- budgeting duration field;
- cache hit/miss;
- candidate count;
- available budget;
- consumed budget;
- dropped items and drop reasons.

Runnable diagnostic example:

```ts
import { KeywordRetrievalProvider } from './src/features/retrieval';

const result = await new KeywordRetrievalProvider().retrieve('Create Supabase RLS policies');
console.log(result.diagnostics);
```

Expected diagnostic shape:

```ts
{
  retrievalTimeMs: 42,
  rankingTimeMs: 0,
  budgetTimeMs: 42,
  cacheHit: false,
  cacheMiss: true,
  candidateCount: 5,
  availableBudget: 2500,
  consumedBudget: 1210,
  droppedItems: []
}
```

## Small-window audit

Promptium’s current product direction is a floating app window, not a side panel. The minimum usable width should stay above `500px` because the app opens at roughly `500x850` from the service worker and floating-window service paths.

Manual smoke check:

```text
1. Run pnpm dev.
2. Open Promptium.
3. Resize the floating window to 600px, 700px, and 800px widths.
4. Open Prompt Library, Vault, Settings, Export Preview, and Refinement.
5. Verify no horizontal body scroll, clipped modal footer, or unreachable primary action.
```

## Edge cases

- Cold retrieval can exceed the warm target because Compromise and Tiktoken may load for the first time.
- Very large pinned knowledge can still be omitted if deterministic compression cannot fit it under the global context limit.
- MV3 service workers may add latency after idle suspension; warm targets assume the extension context is already active.
