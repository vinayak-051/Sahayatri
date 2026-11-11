# Project status

**Branch:** `hardening/phase-1` (not merged into `main`, not pushed). **Production:** unchanged; see the blockers below.

## Verified state of the branch
| Check | Result |
|---|---|
| Frontend lint / typecheck / unit tests / build | ✅ / ✅ / ✅ 29 tests / ✅ |
| Database tests (PGlite) | ✅ 74 tests |
| `npm audit` (frontend) | 7 moderate, all development tooling (`typescript-eslint` → `minimatch`); 0 high or critical |

## Done
- **Phase 1, Foundation** (see ROADMAP): audit, versioned migrations, database test harness, security and integrity migration, frontend aligned with it, edge functions hardened, CI typecheck and database jobs, dependency upgrades.
- **Independent security review:** all 8 findings fixed, each with a regression test.
- **Phase 3 (partial):** calendar export for trips; day planner for saved places.
- **Docs:** README, AUDIT, ROADMAP, DECISIONS, ARCHITECTURE, CHANGELOG, this file.

## In progress (parallel agents, each in its own worktree)
| Stream | Scope | State |
|---|---|---|
| Chat reliability | Shared hook, filtered realtime, reconnect refetch, pagination, optimistic send, read receipts, `my_conversations()` | Running |
| Admin tools | `admin_overview_stats()`, audited review deletion, Reviews tab, review eligibility on guide pages | Running |
| Travel Buddy | Route the page, validation, request states, notification triggers, Travel Tips | Running |
| Search and discovery | Full-text search, keyset pagination, stale-response guard, Guides city filter | Queued |
| Offline and push | Service worker rewrite, push opt-in, non-blocking auth listener | Queued |

Each stream is merged only after lint, typecheck, unit tests, database tests and build pass together.

## Remaining (by priority)
1. Merge the agent streams; run the full verification.
2. TypeScript `strict` mode.
3. Guide availability calendar; trust signals on guide pages.
4. Accessibility pass; dark mode; map viewport loading.

## Blockers: need the project owner
| # | Action | Why I can't | How |
|---|---|---|---|
| 1 | **Apply the migrations to production** | Your brief forbids altering production without authorisation; it also needs your Supabase login | From `backend/`, run `supabase login`, then `supabase link --project-ref tmxyywcheugmmwzqsovg`. Mark the baseline as applied (`supabase migration repair --status applied 20260709000000`), then run `supabase db push` |
| 2 | **Deploy the edge functions** | Same | `supabase functions deploy` from `backend/`. Add the header `Authorization: Bearer <service role key>` to the `send-push` Database Webhook |
| 3 | **Deploy the frontend after step 1** | Production deploy | From `frontend/`: `npx vercel deploy --prod` (the old frontend selects `*` from profiles, which the new rules reject, so deploy right after the migration) |
| 4 | Merge `hardening/phase-1` into `main` and push | It's a shared team repository | Review the branch, then merge and push |
| 5 | Staging Supabase project + Vercel Git integration | Creates infrastructure in your accounts | Enables end-to-end tests and preview deploys |
| 6 | Razorpay test keys and webhook secret in function secrets | Credentials | `supabase secrets set …` (see README) |
| 7 | Supabase Auth Site URL and Redirect URLs | Dashboard setting | Set them to https://sahayatri-nu.vercel.app |
