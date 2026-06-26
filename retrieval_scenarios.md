# Retrieval scenarios

The executable corpus lives in `src/features/retrieval/retrieval-scenarios.ts` and runs through `pnpm test:retrieval`.

| Prompt family           | Expected context                         |
| ----------------------- | ---------------------------------------- |
| SaaS architecture       | SaaS Architecture Guide — retrieved      |
| Supabase RLS policies   | Supabase Guide / RLS section — retrieved |
| FlutterFlow attendance  | FlutterFlow Attendance — retrieved       |
| Water-hyacinth research | AquaHarvester Research — retrieved       |
| TypeScript API          | Always TypeScript — pinned               |

Each family runs ten numbered variants, producing 50 stable regression scenarios.
