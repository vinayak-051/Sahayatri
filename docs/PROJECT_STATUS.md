# Project status

**Branch:** `main` (pushed). **Production (2026-11-13):** all 7 migrations applied, all 3 edge functions deployed, frontend deployed to https://sahayatri-nu.vercel.app.

## Verified state of the branch
| Check | Result |
|---|---|
| Frontend lint / typecheck (strict) / unit tests / build | ✅ / ✅ / ✅ 153 tests / ✅ |
| Database tests (PGlite: migrations + security rules) | ✅ 118 tests |
| `npm audit` (frontend) | 7 moderate, all development tooling (`typescript-eslint` → `minimatch`); 0 high or critical |

Not verified: anything against a live Supabase project (Realtime delivery, Storage limits, edge functions in Deno, Razorpay). These are covered only by mocks and PGlite until the owner applies the changes (blockers 1–3).

## Done
- **Phase 1, Foundation:**
  - audit; versioned migrations; database test harness;
  - security and integrity migration, plus fixes for all 8 findings from the independent review;
  - frontend aligned with the new rules; edge functions hardened;
  - CI typecheck and database jobs; dependency upgrades;
  - TypeScript strict mode.
- **Phase 2, Core product** (parallel agents, merged and verified together):
  - **Chat:** a shared hook, filtered realtime, refetch on reconnect, paginated threads, optimistic send with retry, read receipts, `my_conversations()` / `conversation_messages()`.
  - **Search:** full-text search (prefix, city, tags) with keyset pagination, protection against stale responses, safe filter quoting, and the Guides page's city filter.
  - **Travel Buddy:** launched with validation, request states and notification triggers. The "AI Guide" placeholder became Travel Tips.
  - **Admin:** overview aggregated in SQL with correct revenue; an audited Reviews tab; review eligibility on guide pages.
  - **Offline and push:**
    - service worker rewrite (same-origin, bounded caches);
    - push notifications are opt-in, and logging out unsubscribes the browser;
    - non-blocking auth listener, which also fixes re-subscribing on every navigation.
- **Phase 4:** RLS policies evaluate auth checks once per query (search over 5,000 spots: about 228 ms → 46 ms in PGlite).
- **Phase 3 (partial):** calendar export for trips; day planner for saved places.
- **Docs:** README, AUDIT, ROADMAP, DECISIONS, ARCHITECTURE, CHANGELOG, this file.

## Remaining (by priority)
1. Guide availability calendar (blocked dates, enforced in `prepare_booking`).
2. Trust signals on guide pages (completed-trip badges, response rate).
3. Map viewport loading and clustering; the Analytics tab still downloads six months of bookings.
4. Accessibility pass; dark mode.
5. A `pushsubscriptionchange` handler in the service worker; a guide-reviews `deny_banned` policy.

## Blockers: need the project owner
| # | Action | Why I can't | How |
|---|---|---|---|
| ✅ | ~~Apply the migrations to production~~ (done 2026-11-13) | Your brief forbids altering production without authorisation; it also needs your Supabase login | From `backend/`, run `supabase login`, then `supabase link --project-ref tmxyywcheugmmwzqsovg`. Mark the baseline as applied (`supabase migration repair --status applied 20260709000000`), then run `supabase db push` |
| ✅ | ~~Deploy the edge functions~~ (done; `send-push` webhook header still needed once push is configured) | Same | `supabase functions deploy` from `backend/`. Add the header `Authorization: Bearer <service role key>` to the `send-push` Database Webhook |
| ✅ | ~~Deploy the frontend~~ (done) | Production deploy | From `frontend/`: `npx vercel deploy --prod`. The current live frontend selects `*` from profiles, which the new rules reject |
| ✅ | ~~Merge into `main` and push~~ (done) | It's a shared team repository | Review the branch, then merge and push |
| 5 | Staging Supabase project + Vercel Git integration | Creates infrastructure in your accounts | Enables end-to-end tests and preview deploys |
| 6 | Razorpay keys + webhook secret, and `VAPID_PRIVATE_KEY` (push), in function secrets — none are set today, so online payments and push are off | Credentials | `supabase secrets set …` (see README) |
| 7 | Supabase Auth Site URL and Redirect URLs | Dashboard setting | Set them to https://sahayatri-nu.vercel.app |
