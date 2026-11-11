# Sahayatri: roadmap

**Evidence:** [AUDIT.md](AUDIT.md) (finding IDs such as B1, D2). **Decisions:** [DECISIONS.md](DECISIONS.md). **Live progress:** [PROJECT_STATUS.md](PROJECT_STATUS.md).

**Priority:**
- **P0:** security or data-integrity risk, or broken core flow
- **P1:** essential product or engineering foundation
- **P2:** high-value improvement
- **P3:** polish

**Status:** ✅ done · 🔄 in progress · ⏳ planned · 🔒 blocked on the project owner.

## Principles
1. **The database is the security boundary.** Every rule a user must not bypass lives in Postgres and has an automated test.
2. **Versioned migrations only.** Safe to re-run, and written so the live app keeps working while they're applied.
3. **Verify before claiming.** Lint, type check, unit tests, database tests and the build must pass on every change.
4. **Nothing touches production without the owner.** Production stays untouched until the owner applies the changes (see Phase 6).

## Phase 1: Foundation ✅
| Task | Pri | Depends on | Approach | Done when | Status |
|---|---|---|---|---|---|
| Versioned migrations (A2) | P0 | — | `backend/supabase/migrations`, baseline = old `backend.sql`, Supabase CLI config | `supabase db push` works from `backend/` | ✅ |
| Database test harness (I1) | P0 | migrations | PGlite (PostgreSQL 17 in WebAssembly) + a Supabase shim; queries run as `anon`/`authenticated`/`service_role` | Every rule below has a test; CI job is green | ✅ |
| Admin table lockdown (B1) | P0 | harness | RLS on, client grants revoked | A client cannot read or write `admin_lookup` (tested) | ✅ |
| Profile column grants and privacy (B2, B4) | P0 | harness | Column grants, onboarding guard trigger, `admin_profiles` view | Privileged fields and emails are protected (tested) | ✅ |
| Booking integrity (B3, C1, C2) | P0 | harness | `location_id`, server-side pricing trigger, transition trigger | Only valid transitions succeed; price can't be tampered with (tested) | ✅ |
| Messages, buddy trips, reports, notifications (B5–B7, D1) | P0 | harness | Grants, constraints, policies | Tested | ✅ |
| Payouts, atomic payment capture, view counter, storage limits (D2, B11, D3, B10) | P0 | harness | SECURITY DEFINER functions with checks | Tested | ✅ |
| Frontend aligned with the new rules (B8, B9, D4) | P0 | migration | Explicit columns, RPCs, error mapping | `tsc`, lint, tests and build pass; forgot password works | ✅ |
| Dependency security (H1–H3) | P0 | — | Vite 7, Vitest 5, React Router 7, Zod 4; remove unused packages | No high or critical advisories | ✅ |
| Independent security review of Phase 1 | P0 | all of the above | Review agent | Findings fixed or recorded | 🔄 |

## Phase 2: Core product
| Task | Pri | Depends on | Approach | Done when | Status |
|---|---|---|---|---|---|
| Reliable chat (A4, E1) | P1 | Phase 1 | Shared hook, filtered subscriptions, refetch on reconnect, paginated threads, optimistic send, read receipts, `my_conversations()` | Both chat pages use the hook; tests for merge logic and the SQL function | 🔄 |
| Search and discovery (C3, D5, F4) | P1 | `locations.city` | Full-text search (`search_vector` + GIN), `search_locations()` with keyset pagination, stale-response guard, safe filter quoting, Guides city filter | City and prefix search work; no stale results; tested | 🔄 |
| Travel Buddy launch (D8) | P1 | Phase 1 | Route the finished page; validation; request states; notifications via triggers; "AI Guide" becomes Travel Tips | `/travel-buddy` works end to end; notification triggers tested | 🔄 |
| Admin tools (G1, D6, D7) | P1 | Phase 1 | `admin_overview_stats()`, audited `admin_delete_review()`, Reviews tab, review eligibility on guide pages | Overview needs no full-table downloads; moderation tested | 🔄 |
| Offline shell, push opt-in, auth robustness (F2, B12) | P1 | — | Service worker rewrite, opt-in push controls, non-blocking auth listener | No cross-origin or error caching; no automatic permission prompt; auth tests | 🔄 |

## Phase 3: Advanced capabilities
| Task | Pri | Depends on | Approach | Done when | Status |
|---|---|---|---|---|---|
| Guide availability calendar | P2 | booking integrity | `guide_unavailable_dates` table; `prepare_booking` rejects blocked dates; guide calendar UI; traveller date picker greys out blocked days | Booking a blocked date fails (tested); guide can manage dates | ⏳ |
| Trust signals | P2 | — | "Completed trip" badge on reviews; guide response rate and median response time from bookings (SQL view); member-since | Shown on guide pages; computed in SQL and tested | ⏳ |
| Day planner for saved spots | P2 | city, search | Group saved spots by city; order a day's route by nearest neighbour on coordinates; show total distance; "Request a guide" for that city | Deterministic and unit-tested; no paid API | ⏳ |
| Calendar export | P3 | — | `.ics` download for confirmed trips | Valid ICS (unit-tested) | ⏳ |
| AI trip assistant | P3 | planner | Claude via an edge function, grounded on verified spots | 🔒 Needs a paid API key: the owner decides | 🔒 |

## Phase 4: Engineering excellence
| Task | Pri | Depends on | Approach | Done when | Status |
|---|---|---|---|---|---|
| TypeScript strict mode (F1) | P1 | Phase 2 merges | Enable `strict`; fix errors | `strict: true`, typecheck green | ⏳ |
| Generated database types (A3) | P2 | 🔒 CLI access to a project | `supabase gen types typescript` → typed client | Typed `createClient<Database>` | 🔒 |
| Data-access layer | P2 | types | Move queries into `src/data/*` modules and hooks with consistent errors | Pages contain no raw query strings for core entities | ⏳ |
| Map scaling (G1) | P2 | search | Viewport (bounding-box) loading + lightweight grid clustering | Map loads only visible spots; tested helper | ⏳ |

## Phase 5: Product experience
| Task | Pri | Depends on | Approach | Done when | Status |
|---|---|---|---|---|---|
| Accessibility pass (F3) | P2 | — | Labels, `aria-current`, focus states, contrast, no nested buttons | No axe violations on the main pages | ⏳ |
| Dark mode | P3 | — | `.dark` colour tokens + `next-themes` toggle (already a dependency) | All pages legible in dark mode | ⏳ |
| Consistent loading, empty and error states | P2 | data layer | Shared components | Every list page has all three | ⏳ |

## Phase 6: Production readiness
| Task | Pri | Depends on | Approach | Done when | Status |
|---|---|---|---|---|---|
| CI: lint, typecheck, unit tests, database tests, build | P0 | — | GitHub Actions, two jobs | Green on PRs | ✅ |
| Apply migrations to production | P0 | review | `supabase login` → `link` → `db push` (or the SQL editor) | Live database on the new rules; smoke-tested | 🔒 |
| Deploy edge functions | P0 | migrations | `supabase functions deploy`; webhook header for `send-push` | Payments confirm via the RPC | 🔒 |
| Deploy the frontend | P0 | migrations applied | Vercel (after the database) | Live site on the new build | 🔒 |
| Staging project + Vercel Git integration | P1 | owner | Second Supabase project; preview deploys per PR | Changes verified on staging before production | 🔒 |
| Monitoring | P2 | owner | Sentry DSN; uptime ping (also prevents the free-tier pause) | Errors visible; no surprise pauses | 🔒 |
| End-to-end tests in CI | P2 | staging | Playwright against a preview deployment with a seeded staging database | Happy paths green in CI | 🔒 |

## Phase 7: Continuous improvement
Candidate ideas, ranked by value ÷ cost and reviewed after every phase:
- Hindi localisation for traveller flows.
- Photo galleries for spots and reviews.
- Guide payout automation (RazorpayX).
- Group bookings and split payments.
- Offline-first saved spots.
- Spot recommendations from save and booking history (SQL first, ML later).
