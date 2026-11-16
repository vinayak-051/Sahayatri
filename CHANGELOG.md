# Changelog

All notable changes to Sahayatri. Dates are UTC. Work happens on `hardening/phase-1` until it is merged into `main`.

## 2026-11-17: production test round

Live cross-account smoke test (`backend/scripts/smoke-production.mjs`): 29/29 pass.

### Fixed
- **Sign-in on production:** an older admin rule read the admin table directly.
- **Reviews:** an older review rule let any traveller review any guide without a completed trip, and banned users could post guide reviews.
- **Expired requests:** pending requests whose date has passed show as "Expired" and can no longer be accepted.
- **Acceptance wording:** "Booking accepted… Pay the advance to confirm it" replaces "Booking confirmed".
- **Payments:** the Pay button explains that online payment isn't available yet, instead of a generic error.
- **Guide profile numbers:** they now come from completed trips and the ledger.
- **Admin Analytics:** retry instead of an endless spinner on error.

### Added
- **Guide availability calendar:** guides block dates; requests and acceptances on blocked dates are refused.
- **Trust strip on guide pages:** completed trips, response rate, typical response time, member since.
- **Admin Analytics** is aggregated in the database (`admin_booking_timeseries`).

## Earlier

### Security
- **Fixed:** `admin_lookup` (who is an admin) was readable and writable through the API.
- **Fixed:** users could set their own verification, ban, rating, admin and email fields.
- **Fixed:** profile emails were visible to other users. Admins now read them through the read-only `admin_profiles` view.
- **Fixed:** travellers could accept their own bookings, mark trips completed early (unlocking reviews), or change the price. Bookings are now priced on the server, and only real status transitions succeed.
- **Fixed:** message receivers could rewrite messages, and clients could back-date messages and reports to get around rate limits.
- **Fixed:** requesters could self-approve buddy requests, and guides could self-approve verification requests.
- Buddy trips now require a sign-in.
- Only admins resolve reports.
- Upload size and type are limited on the server.
- `send-push` only accepts calls from the database.
- The webhook signature is compared in constant time.
- Upgraded Vite, Vitest, React Router and Zod. `npm audit` went from 24 advisories (2 critical, 8 high) to 7 moderate, all in development tooling.

### Fixed
- Forgot password works again for logged-out users. It also no longer reveals which emails have accounts.
- Paying the advance confirms the booking again. Before, the notification type it inserted was rejected and the confirmation rolled back.
- The admin payouts tab shows balances, and recording a payout works (audited, never more than the balance).
- Spot view counts include travellers, and increments are atomic.
- Payment capture is one idempotent transaction. Duplicate or late payments are refunded automatically, and never credited twice.
- Booking and other database errors show readable messages.
- The guide chat no longer drops a message silently when sending fails.
- The Notifications page no longer crashes on advance-payment notifications.
- Onboarded users are no longer shown the role form, which they could no longer submit.

### Added
- **Chat:**
  - live updates arrive only for your own conversations;
  - reconnecting refetches anything missed;
  - long threads load in pages;
  - messages show instantly, with a retry if sending fails;
  - "Seen" receipts;
  - message notifications open the right chat.
- **Search:** finds spots by name, city, tag and description, matching partial words. It never shows stale results, shows the true total, and pages through results consistently.
- **Travel Buddy is live:** form validation, request status, notifications for requests and acceptances.
- **Travel Tips** replaces the "AI Guide" placeholder.
- **Admin:**
  - the overview is computed in SQL, and "revenue" is now real platform revenue;
  - a Reviews tab with audited deletion;
  - "Write review" is shown only to eligible travellers.
- **Push and offline:**
  - push notifications are opt-in, with an on/off switch on the Notifications page;
  - logging out unsubscribes the browser;
  - the offline shell caches only the app's own files.
- Spots have their own city.
- "Add to Calendar" (.ics) for upcoming trips.
- A day planner on Saved Places: city groups, route order, Google Maps link.
- Versioned migrations under `backend/supabase/migrations`.
- A database test suite on PGlite (118 tests); 153 frontend unit tests.
- Typecheck and database jobs in CI.
- The documentation set in `docs/`: audit, roadmap, decisions, architecture, status.

### Changed
- Row-level security checks run once per query instead of once per row (search about 5× faster on 5,000 spots).
- TypeScript strict mode is on.
- Viewing Travel Buddy no longer deletes your expired trips.
- Price bands no longer overlap: a spot priced exactly ₹2,000 is listed under "₹2k+".

### Removed
- `VITE_ADMIN_EMAIL`, which exposed the admin's email in the bundle.
- The unused `@tailwindcss/typography`.
- The admin realtime listener on an unpublished table.
