# Sahayatri Journeys

A travel app connecting tourists with local guides across India — browse guide-authored
spots, book a guide, chat in real time, leave reviews, and plan trips with other travelers.

**Architecture**: React + Vite frontend, talking directly to [Supabase](https://supabase.com)
for authentication, the Postgres database (with Row Level Security), file storage, and
realtime messaging. There is no separate backend server — `backend/` only holds the SQL
schema and an admin-only seed script.

```
frontend/   React + Vite app (the only thing you run with `npm run dev`)
backend/    SQL migrations + a Node seed script (uses the Supabase service-role key)
```

## Prerequisites

- Node.js 20+
- A free [Supabase](https://supabase.com) account and project

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project. Pick any region/password.
2. Open **SQL Editor** in the project dashboard, paste the contents of
   [`backend/migrations/0001_init.sql`](backend/migrations/0001_init.sql), and run it.
   This creates every table, Row Level Security policy, the `profiles` auto-creation
   trigger, the two Storage buckets (`avatars`, `location-media`), and enables Realtime
   on the `messages` table. Then run `0002_sync_guide_rating.sql`, `0003_guide_rate.sql`,
   `0004_unique_email.sql`, and `0005_real_time_fixes.sql` in that order (each is a small,
   focused follow-up — see the comment at the top of each file for what it does and any
   manual steps required before running it, e.g. `0004` needs existing duplicate emails
   resolved first).
3. New guides start with `is_verified = false` and show no "Verified" badge anywhere in
   the app. There's no admin UI for this yet — once you've actually verified a guide's
   identity, flip their row's `is_verified` to `true` directly in **Table Editor →
   profiles**.
4. (Optional, for "Continue with Google") In **Authentication → Providers**, enable
   Google and paste your own OAuth client ID/secret from
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Add
   `http://localhost:8000` to your app's authorized redirect origins as needed.

## 2. Configure environment variables

**Frontend** — copy the example and fill in your project's public values (Project
Settings → API in the Supabase dashboard):

```bash
cp frontend/.env.example frontend/.env.local
```

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

**Backend (seed script only)** — this needs the **service role** key, which bypasses
Row Level Security. Never commit it, never put it in a `VITE_`-prefixed variable, and
never ship it to the frontend.

```bash
cp backend/.env.example backend/.env
```

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

## 3. Install and seed

From the repo root:

```bash
npm install --workspace=frontend
npm install --workspace=backend
npm run seed
```

The seed script creates 5 travelers, 8 guides (across Jaipur, Kochi, Leh, Varanasi,
Udaipur, Madurai, Hyderabad, and Gangtok), 15 real location listings, a mix of bookings,
buddy trips, a message thread, and reviews — then prints every demo login email plus the
shared password to your terminal. Demo password for every seeded account:

```
Sahayatri@123
```

## 4. Run the app

```bash
npm run dev
```

Open **http://localhost:8000** and log in with any seeded email above (e.g.
`vinayak.traveler@sahayatri.dev` as a traveler, or `guide.jaipur@sahayatri.dev` as a
guide) and the password above.

## Staging vs. production

There is currently only **one** Supabase project, used for both local development and
whatever you consider "production." Before any real users sign up, create a **second
Supabase project** for production and re-run the migrations there (`0001`–`0005`) —
keep development/demo data in the original project entirely separate from real user
data. Point `frontend/.env.local` (or your deploy host's env vars) and `backend/.env` at
whichever project you mean to target; the two projects don't need to share anything.

## Testing

```bash
npm run test --workspace=frontend     # vitest unit tests (mocked Supabase client)
npm run lint --workspace=frontend     # eslint
npx playwright test                   # e2e — requires a seeded, running app (see below)
```

Playwright's `happy-path.spec.ts` logs in with the seeded demo accounts and exercises
the real Supabase-backed Explore/booking flow, so run `npm run seed` against your
project and `npm run dev` (or let Playwright's `webServer` start it for you) before
running e2e specs.

## Troubleshooting

- **"Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"** — you haven't created
  `frontend/.env.local`. Restart `npm run dev` after creating it; Vite only reads env
  files at startup.
- **Seed script throws "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"** — same
  idea, but for `backend/.env`, and it needs the *service role* key, not the anon key.
- **Login works but Explore/Map show nothing** — you haven't run the SQL migration or
  the seed script against this project yet.
- **403 / "row-level security policy" errors** — you're likely using the anon key
  where a service-role key is expected (or vice versa), or a policy in
  `0001_init.sql` wasn't applied. Re-run the migration SQL in the Supabase SQL editor;
  it's safe to re-run `create policy` statements only if the table was freshly created,
  so on a non-fresh project drop conflicting policies first.
- **Migration only partially applied / "table not found in schema cache" / seed script
  fails on a table that should exist** — the SQL editor run stopped partway through (or
  you're re-running it on a project that already has some of these objects). Paste
  [`backend/migrations/reset_and_reapply.sql`](backend/migrations/reset_and_reapply.sql)
  instead — it drops anything that might already exist before recreating everything, so
  it's always safe to run from scratch. If the seed script then fails with "a user with
  this email address has already been registered", that's expected after a reset — the
  seed script handles it automatically (it backfills the profile row for the
  already-existing auth user) and you can just re-run `npm run seed`.
- **Google sign-in redirects to an error page** — the Google provider isn't enabled in
  Supabase Authentication → Providers, or the redirect URL isn't allow-listed there.
- **Realtime messages don't appear live** — confirm `alter publication supabase_realtime
  add table public.messages;` ran (it's in the migration) and that Realtime is enabled
  for the project (Database → Replication).
