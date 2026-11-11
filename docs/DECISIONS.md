# Architecture decisions

Each entry records the context, the decision, the alternatives considered, and the consequences.

## D-01 · Keep React + Vite + Supabase (2026-11-09)
**Context:** a two-sided marketplace with real-time chat, payments and moderation, built by a small team.

**Decision:** keep the React 18 SPA on Vite, Supabase (Postgres, Auth, Storage, Realtime) and Deno edge functions. Deploy the frontend on Vercel.

**Alternatives:**
- **Next.js:** server rendering would help SEO for spot pages. But the app is mostly behind login, and migrating would cost weeks.
- **Custom API (Node or Spring) in front of Postgres:** more explicit authorisation code, but it duplicates what RLS already does and adds a service to run.

**Consequences:** authorisation stays in SQL, so the SQL needs its own tests (see D-03). SEO for public pages stays limited.

## D-02 · Versioned migrations in the Supabase CLI layout
**Context:** one 862-line `backend.sql`, a README pointing at a migrations folder that didn't exist, and changes pasted into the SQL editor by hand.

**Decision:** `backend/supabase/migrations/<timestamp>_<name>.sql`. The old file becomes the baseline, already applied to production. New files must be safe to re-run.

**Alternatives:** keep one file and re-run it; Sqitch or Flyway.

**Consequences:** `supabase db push` applies only new files. The baseline must be marked as applied on production once (`supabase migration repair --status applied 20260709000000`).

## D-03 · PGlite for database tests
**Context:** there's no Docker on the dev machine, and none is guaranteed in CI. `supabase start` needs Docker.

**Decision:** run every migration in PGlite (PostgreSQL 17 compiled to WebAssembly) behind a small shim for Supabase's roles, `auth.uid()`, storage tables and the realtime publication. Tests switch role exactly as PostgREST does.

**Alternatives:**
- pgTAP on a local Supabase: needs Docker.
- Tests against a shared cloud project: slow, flaky, and they'd mutate real data.

**Consequences:** fast (about 6 s), hermetic, CI-friendly. Supabase-specific behaviour outside the shim (Realtime authorisation, storage API) isn't covered and is checked manually on staging.

## D-04 · Column-level grants for field-level security
**Context:** RLS is row-level. Several policies let users update any column of a row they own, or read every column, including emails.

**Decision:** revoke table-level `SELECT`/`INSERT`/`UPDATE` from client roles on sensitive tables and grant only the allowed columns. Rules that depend on old *and* new values (role changes, booking transitions) live in `SECURITY INVOKER` triggers that check `current_user`.

**Alternatives:**
- One view per table: duplicated logic, and writes through views are awkward.
- RPCs for every write: heavier client code, and PostgREST CRUD is lost.

**Consequences:** clients must name columns explicitly (no `select *` on profiles). New columns must be added to the grants (noted in the migration header). Admins read private columns through the `admin_profiles` view, gated by `is_admin()`.

## D-05 · Server-side pricing and a booking state machine
**Context:** the browser computed `amount`, and any party could set any status.

**Decision:**
- `bookings.location_id` lets the database price a spot booking (price × people). Guide bookings use `rate_per_day`.
- A `BEFORE INSERT` trigger forces new client requests to `pending` and owns the money fields.
- A `BEFORE UPDATE` trigger allows only these transitions:
  - guide: `pending → accepted` or `declined`
  - traveller: `pending|accepted → cancelled`, and `accepted|confirmed → completed` on or after the trip date
  - payment system only: confirmation and paid cancellation

**Alternatives:** an RPC per transition (stronger encapsulation, but a bigger change to the client code).

**Consequences:** the client sends intent, not money. Clear error messages come back from the triggers, and `lib/dbErrors` shows them to users.

## D-06 · Atomic, idempotent payment capture
**Decision:** the webhook only verifies the signature, using a constant-time comparison. It then calls `process_payment_captured()`, which claims the payment row with `UPDATE … WHERE status = 'created' RETURNING` and makes every related change in one transaction.

**Consequences:** Razorpay retries are safe, and a failure returns HTTP 500 so Razorpay retries again.

## D-07 · Multi-agent execution with worktree isolation
**Decision:** independent streams (chat, search, buddy, admin, PWA/auth) run as parallel agents, each in its own git worktree with a disjoint set of files and its own migration file. An independent review agent checks the security changes. The lead integrates, resolves conflicts and runs the full verification.

**Consequences:** no agent edits shared infrastructure (test harness, package files, CI, docs). Integration happens on `hardening/phase-1`.

## D-08 · No production changes without the owner
**Decision:** migrations, function deploys and frontend deploys are prepared and verified locally, then handed to the owner with exact commands (see PROJECT_STATUS.md).

**Why:** the owner's brief forbids changing production infrastructure without explicit authorisation. The database is shared with the live demo and with teammates.
