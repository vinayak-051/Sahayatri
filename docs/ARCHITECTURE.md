# Sahayatri: architecture

Decisions and their alternatives are in [DECISIONS.md](DECISIONS.md).

## 1. System overview
```
 Browser: React 18 SPA (Vite build, static files on Vercel)
   │  supabase-js sends: anon key (public) + the user's JWT
   ├─► Auth       /auth/v1      email/password, Google OAuth → auth.users ─trigger─► profiles
   ├─► PostgREST  /rest/v1      every query runs through RLS + column grants + triggers
   ├─► Storage    /storage/v1   avatars, location-media (public) · verification-docs (private)
   ├─► Realtime   websocket     change events: messages, bookings, notifications
   └─► Functions  /functions/v1/payments-api   checks the JWT, then uses the service role ─► Razorpay
 Razorpay ─webhook─► razorpay-webhook   HMAC check → process_payment_captured() (one transaction)
 notifications INSERT ─Database Webhook─► send-push (service-role bearer only) ─► Web Push
```

There is no application server. **Postgres is the backend:** schema, authorisation and business rules all live there. Edge functions exist only for work that needs secrets (Razorpay keys, VAPID keys).

## 2. Repository layout
| Path | Contents |
|---|---|
| `frontend/src/pages` | One component per route; all lazy-loaded from `App.tsx` |
| `frontend/src/context/AuthContext.tsx` | Session, profile (`PROFILE_COLUMNS`), login, sign-up, Google sign-in |
| `frontend/src/components` | `ProtectedRoute` (role-based routing), navs, `ErrorBoundary`, shadcn/ui primitives |
| `frontend/src/lib` | Supabase client, `dbErrors` (readable errors), `razorpay`, `push`, `ics`, `dayPlanner`, validators |
| `frontend/src/test` | Vitest + Testing Library unit tests |
| `backend/supabase/migrations` | Versioned schema: baseline + timestamped changes |
| `backend/supabase/functions` | `payments-api`, `razorpay-webhook`, `send-push` (Deno) |
| `backend/tests/db` | PGlite harness, Supabase shim, and database tests |
| `backend/seed.mjs` | Demo data (service-role key; local use only) |

## 3. Data model
| Area | Tables |
|---|---|
| People | `profiles` (1:1 with `auth.users`; `role` traveler or guide; `is_verified`, `is_banned`, `onboarded`), `admin_lookup` |
| Catalogue | `locations` (guide-authored spots; `city`, price, photos, rating and counters kept by triggers), `saved_locations` |
| Trips | `bookings` (`location_id`, server-priced `amount`, status state machine), `payments` (one row per Razorpay order), `guide_ledger` (append-only earnings, commission, payouts) |
| Social | `messages`, `notifications`, `push_subscriptions`, `buddy_trips`, `buddy_requests` |
| Trust | `reviews` (guides; requires a completed trip), `location_reviews` (spots), `reports`, `verification_requests`, `admin_actions` (audit log) |

Views:
- `guide_rating_stats` (security invoker)
- `admin_profiles` (admin-only, read-only)

## 4. Security model
Defence in depth, from the browser inwards. Only the database layers are trusted.

1. **UI guards** (`ProtectedRoute`, hidden buttons): convenience only.
2. **Row-level security:** every table except `admin_lookup` (which has RLS on and no client access). Policies are written in terms of `auth.uid()`; admin checks go through `is_admin()`.
3. **Column-level grants:** clients may read and write only listed columns. Emails, verification, ban, rating and admin flags, money fields and timestamps are server-owned.
4. **Triggers:**
   - `prepare_booking`: server-side pricing; new client requests are always pending.
   - `enforce_booking_update`: the allowed status transitions.
   - `guard_profile_update`: the role is fixed after onboarding.
   - Rate limits on messages, bookings and reports.
   - Notification and rating-sync triggers.

   The guards check `current_user`, so writes made inside SECURITY DEFINER functions and by the service role pass.
5. **SECURITY DEFINER functions** for privileged multi-step work:
   - `admin_*`: each checks `is_admin()` and writes an audit row.
   - `process_payment_captured`: service role only.
   - `increment_location_views`: atomic.
6. **Edge functions:**
   - `payments-api` verifies the JWT and checks ownership in code.
   - `razorpay-webhook` checks the HMAC with a constant-time comparison.
   - `send-push` requires the service-role bearer.
7. **Storage:** owner-only folders, a private bucket for ID documents (admins view them through 5-minute signed URLs), and size and MIME limits per bucket.

Secrets:
- **Public, safe in the bundle:** the anon key, VAPID public key and Sentry DSN.
- **Never shipped to the browser:** the service-role key, Razorpay keys and VAPID private key. The service-role key is also used locally by the seed script.

## 5. Key flows
**Booking and payment**
1. The traveller inserts a booking with `location_id`; the trigger prices it.
2. The guide accepts. The verified-guide check and the partial unique index on `(guide_id, date)` prevent double-booking.
3. `payments-api` creates (or reuses) a Razorpay order for 50%.
4. Razorpay calls the webhook, and `process_payment_captured()` confirms the booking.
5. After the trip, the final 50% is paid online (ledger credit minus 15%) or in cash.
6. Payments that can't be applied are marked `needs_refund` and refunded automatically.

**Realtime:** clients subscribe to Postgres Changes, and Realtime delivers only rows the subscriber's RLS allows. The database stays the source of truth; clients refetch on (re)subscribe.

**Notifications:** triggers insert `notifications` rows. Realtime updates the badge and feed, and a Database Webhook drives `send-push` for OS-level push.

## 6. Testing strategy
| Layer | Tool | What it proves |
|---|---|---|
| Database | Vitest + PGlite (`backend/tests/db`) | Migrations apply, re-apply and converge; every policy, grant, trigger and function behaves correctly for anon, authenticated, admin and service roles |
| Frontend logic and components | Vitest + Testing Library + jsdom | Auth, routing, error mapping, calendar export, day planner, form validation |
| Types | `tsc --noEmit` | No type errors (the Vite build doesn't type-check) |
| End to end | Playwright (`frontend/tests`) | Happy paths against a seeded project. Run manually until a staging project exists |

CI (`.github/workflows/ci.yml`) runs everything except the end-to-end tests on each push and PR to `main`.

## 7. Performance notes
- Route-level code splitting plus vendor chunks; lazy images; skeletons.
- Indexes on every foreign key, on `status` fields, and a partial unique index for accepted bookings.
- Counters and ratings are denormalised and kept in sync by triggers, so list pages stay cheap.
- **Known limits:** the map loads every spot (viewport loading is planned). Full-text search, server-side chat filtering and SQL aggregates for the admin overview are being merged in Phase 2.
