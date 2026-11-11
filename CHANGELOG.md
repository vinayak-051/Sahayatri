# Changelog

All notable changes to Sahayatri. Dates are UTC. Work happens on `hardening/phase-1` until it is merged into `main`.

## Unreleased

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
- Spots have their own city.
- "Add to Calendar" (.ics) for upcoming trips.
- A day planner on Saved Places: city groups, route order, Google Maps link.
- Versioned migrations under `backend/supabase/migrations`.
- A database test suite on PGlite (74 tests).
- Typecheck and database jobs in CI.
- The documentation set in `docs/`: audit, roadmap, decisions, architecture, status.

### Removed
- `VITE_ADMIN_EMAIL`, which exposed the admin's email in the bundle.
- The unused `@tailwindcss/typography`.
- The admin realtime listener on an unpublished table.
