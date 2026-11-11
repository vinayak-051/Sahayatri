# Sahayatri: technical audit

**Date:** 2026-11-09
**Baseline:** commit `a7b4b1e` on `main`

**Method:**
- Read the source (frontend, `backend/backend.sql`, the edge functions, CI).
- Ran `eslint`, `tsc --noEmit`, `vitest` and `npm audit`.
- Ran read-only checks against the live Supabase project using the public anon key.
- Probed database behaviour in PGlite (PostgreSQL 17).

**Severity:** Critical / High / Medium / Low. **Disposition:** Retain · Refactor · Redesign · Remove · New.

## 1. Summary
Sahayatri is a working React + Supabase marketplace with a sound core design:
- The browser talks to Postgres through PostgREST, and authorisation lives in Postgres row-level security (RLS).
- Money moves only through edge functions.

The weaknesses come from three habits:
1. **Rows instead of columns.** RLS decides *which rows* a user can touch, never *which columns*. Several UPDATE policies therefore let users change fields they should never control: verification, bans, ratings, booking status, price.
2. **Business rules in the browser.** Prices are computed in the browser, booking status changes happen from the client, and some security checks exist only in the UI.
3. **No verification loop.** CI runs no type check and has no database tests. Database types are hand-written. Several features are broken in production and nothing noticed: forgot password, admin payouts, and the booking confirmation after payment.

**Decision:** keep the stack. Fix the security and integrity gaps in the database first, then the broken flows, then the engineering foundation (types, tests, CI/CD), then new features.

## 2. Findings

### A. Architecture
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| A1 | — | React 18 + Vite + TypeScript SPA on Supabase (Postgres, Auth, Storage, Realtime), 3 Deno edge functions, Vercel hosting. A good fit for the product and the team. | **Retain** |
| A2 | Med | The schema is one 862-line SQL file with no migration history. The README points to a `backend/migrations/` folder that doesn't exist. Nothing can be applied to the live database incrementally. | **Redesign:** versioned migrations in the Supabase CLI layout (`backend/supabase/migrations`) |
| A3 | Med | Data access is spread across 30 pages, with untyped queries and no shared data layer. Database types are hand-written and already out of sync with the schema. | **Refactor:** generated types, shared hooks |
| A4 | Low | `Messages.tsx` and `GuideMessenger.tsx` are near-duplicates with different error handling. | **Refactor:** one hook |

### B. Security and privacy
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| B1 | **Critical** | `admin_lookup`, the table that decides who is an admin, has RLS disabled. On Supabase, public tables are reachable through the API, so any client could add itself as admin. | Enable RLS and revoke client grants |
| B2 | High | `profiles_update_self` has no column limits. Users can set their own `is_verified` (skipping ID review), `is_banned = false` (undoing bans), `rating`, `email`, or `is_admin`. | Column-level grants + guard trigger |
| B3 | High | `bookings_update_participants` allows any column. A traveller can accept their own booking, mark it completed (which unlocks reviews), or lower `amount` before paying. `amount` is computed in the browser. | Server-side pricing + status state-machine trigger |
| B4 | Med | Profile emails are readable by any logged-in user (all guides), and by anyone who has exchanged a message with that user. RLS cannot hide columns. | Column-level SELECT grants; admins read emails through an admin-only view |
| B5 | Med | The message receiver can rewrite `content` or change `sender_id`. | Only `is_read` is updatable |
| B6 | Med | `buddy_trips` (travel dates and destinations) is readable by anonymous visitors. **Confirmed live.** | Logged-in users only |
| B7 | Med | Guides can dismiss reports about their own listings. | Only admins update reports |
| B8 | Med | **Forgot password is broken for every user who isn't logged in.** It checks `profiles` by email before sending the link, and RLS hides profiles from anonymous users. The same check was also an account-enumeration vector. | Remove the check; show a neutral message |
| B9 | Low | `VITE_ADMIN_EMAIL` compiles the admin's email into the public bundle. | Remove |
| B10 | Low | Storage buckets have no server-side size or MIME limits; only the client checks. | Bucket limits |
| B11 | Low | The webhook's idempotency is check-then-act, its signature comparison is not constant-time, and its writes are not wrapped in a transaction. | Atomic SQL function + constant-time comparison |
| B12 | Low | The browser asks for notification permission straight after login, without any user action. | Ask from an explicit toggle |

### C. Data integrity
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| C1 | High | Bookings store `destination` as free text, with no link to the spot. That's why the server cannot price a booking, and why spot pages look up "my booking" by title. | **New:** `bookings.location_id` FK |
| C2 | Med | No checks on booking dates (past dates allowed), number of people, buddy trip dates (end before start), message length, self-messaging, joining your own buddy trip, or NaN coordinates. | Constraints and triggers |
| C3 | Med | Spots have no `city` column. Cards show the *guide's* city, and search can't find spots by city. | **New:** `locations.city`, backfilled |

### D. Broken or incorrect behaviour
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| D1 | High | After a successful payment, the confirmation inserts a notification type (`booking_advance_paid`) that the CHECK constraint rejects. The booking stays `accepted` and the payment can't be retried. | Fix the constraint; the webhook checks errors |
| D2 | High | Admin payouts: `guide_ledger` has no admin read policy and no insert policy, so the tab is always empty and "mark paid" fails. | Admin policy + payout RPC |
| D3 | Med | The spot view counter never counts travellers: RLS blocks the update and returns no error. It's also a lost-update race. | Atomic RPC |
| D4 | Med | The Notifications page would crash on a `booking_advance_paid` notification (no icon mapped). This is one of 2 TypeScript errors that CI never sees. | Fix and add `tsc` to CI |
| D5 | Med | Explore's "search cities" doesn't search cities. Home's "View All" guides passes a city that the Guides page treats as a name. | Fix |
| D6 | Low | The admin realtime subscription listens on `profiles`, which isn't published, so it never fires. The admin "delete review" button sits on a page admins can't reach. | Remove; move into the admin panel |
| D7 | Low | "Write review" shows for travellers who aren't allowed to review, so they get a raw RLS error. Raw database errors are shown to users across the app. | Eligibility check; error mapping |
| D8 | Low | `/travel-buddy` renders "Coming soon", although `TravelBuddy.tsx` is complete. `/ai-guide` is a static tips page labelled as AI. | Launch Travel Buddy; remove the "AI" page |

### E. Realtime
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| E1 | Med | No refetch after a reconnect (Postgres Changes doesn't replay missed events). Every new message re-downloads the user's whole message history. The chat subscription is unfiltered. | Refactor into a shared hook: filters, refetch on `SUBSCRIBED`, pagination |

### F. Frontend quality and UX
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | Med | TypeScript `strict` is off, and nothing type-checks in CI. | Enable `strict` (cheap: data is mostly `any`, so only 2 errors today) |
| F2 | Med | The service worker caches **every** cross-origin `.png`/`.jpg` (map tiles, storage images) cache-first, forever, including error and opaque responses. Storage grows without limit. Its offline fallback has a bug (`??` on a Promise). | Rewrite: same-origin hashed assets only, OK responses only |
| F3 | Low | Accessibility: nested buttons, unlabeled inputs, no `aria-current`. Dark mode is configured but has no colour tokens. | Fix |
| F4 | Low | Rapid filter changes can show stale results (no request cancellation). Offset pagination can repeat or skip items. | Request guards; keyset pagination later |

### G. Performance
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| G1 | Low | The map loads every spot and guide, with no clustering. The admin overview downloads every booking just to count them. | Server-side aggregates; viewport loading later |

### H. Dependencies (`npm audit`: 24 advisories, 7 in runtime packages)
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| H1 | Med | `react-router-dom` 6.30.4 has an open-redirect issue; fixed in 6.30.6. Several transitive issues have non-breaking fixes. | `npm audit fix` |
| H2 | Med | Development tooling (Vite 5, Vitest 3/tinypool) has dev-server and test-runner advisories. | Upgrade Vite and Vitest (major) |
| H3 | Low | `zod` 3 has a memory-exhaustion advisory (low real risk: client-side forms only). `@tailwindcss/typography` is installed but unused. | Upgrade zod and its resolver; remove the unused plugin |

### I. Testing
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| I1 | High | 12 unit tests (auth, route guard, image validation). No tests for any database rule, though that's where the security lives. The 2 Playwright tests don't run in CI. | **New:** PGlite database test suite in CI |

### J. CI/CD and operations
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| J1 | Med | CI is lint + unit tests + build: no type check, no database tests. Deployment is a manual Vercel CLI step, and schema changes are pasted into the SQL editor by hand. | Add typecheck and database jobs; migration workflow; Vercel Git integration (owner action) |
| J2 | Low | A single Supabase project serves both development and production (noted in the README). The free tier pauses after 7 idle days. | Staging project (owner action) |

## 3. Disposition summary
- **Retain and improve:** stack, PostgREST + RLS model, edge-function payments, design system, lazy routing.
- **Refactor:** data access (types, hooks), chat (shared hook), error handling, service worker.
- **Redesign:** schema management (versioned migrations), booking lifecycle (server-side pricing and transitions), profile privacy (column grants).
- **Remove:** dead admin realtime code, the unreachable review-delete button, the "AI Guide" placeholder, `VITE_ADMIN_EMAIL`, unused `@tailwindcss/typography`.
- **New:** database test suite, `bookings.location_id`, `locations.city`, admin payout RPC, atomic payment processing, Travel Buddy launch, typecheck in CI.
