# Sahayatri Journeys

A travel app connecting tourists with local guides across India. Travellers browse
guide-authored spots, book and pay a verified guide, chat in real time, leave reviews
and find travel buddies. Guides publish spots, manage bookings and get ID-verified
by an admin.

**Live demo:** https://sahayatri-nu.vercel.app

## Architecture

```
frontend/                 React 18 + TypeScript + Vite single-page app (deployed on Vercel)
backend/
  supabase/migrations/    Versioned PostgreSQL schema: tables, row-level security, triggers
  supabase/functions/     Deno edge functions: payments-api, razorpay-webhook, send-push
  tests/db/               Database tests (migrations + security rules) on in-memory PostgreSQL
  seed.mjs                Demo data (uses the service-role key; never ship it to the browser)
docs/                     AUDIT.md (current findings) and ROADMAP.md (plan and decisions)
```

The browser talks to [Supabase](https://supabase.com) directly: Auth, PostgREST
(the database's REST API), Storage and Realtime. **Postgres is the security
boundary.** Row-level security decides which rows a user can touch. Column-level
grants decide which fields. Triggers enforce rules that depend on old and new
values (booking status transitions, server-side pricing). Anything that needs a
secret or moves money runs in an edge function. Razorpay's signed webhook, not the
browser, confirms payments.

## Prerequisites

- Node.js 22+
- A Supabase project (the free tier is fine)
- Optional: the [Supabase CLI](https://supabase.com/docs/guides/cli) for applying migrations and deploying functions

## 1. Create the database

Apply every file in [`backend/supabase/migrations/`](backend/supabase/migrations) **in filename order**. Either:

- **CLI (recommended):**
  ```bash
  cd backend
  supabase login
  supabase link --project-ref <your-project-ref>
  supabase db push
  ```
- **Dashboard:** paste each file into the SQL Editor and run it, oldest first.

To make yourself an admin, run this in the SQL Editor:

```sql
insert into public.admin_lookup (user_id) select id from public.profiles where email = 'you@example.com';
update public.profiles set is_admin = true where email = 'you@example.com';
```

Optional, for "Continue with Google": enable Google under **Authentication → Providers**.

Required for email links (sign-up confirmation, password reset, Google redirects): under
**Authentication → URL Configuration**, set **Site URL** to your app's URL and add
`<your app URL>/**` to the **Redirect URLs**.

## 2. Configure environment variables

**Frontend:** copy the example, then fill it in from **Project Settings → API**. These values are public.

```bash
cp frontend/.env.example frontend/.env.local
```

**Backend (seed script only):** this needs the **service-role** key, which bypasses
row-level security. Never commit it, never put it in a `VITE_` variable, and never
ship it to the browser.

```bash
cp backend/.env.example backend/.env
```

**Edge function secrets** (`supabase secrets set …`): `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `VAPID_SUBJECT`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Deploy the functions with
`supabase functions deploy` from `backend/`.

The `send-push` Database Webhook (on insert into `notifications`) must send the header
`Authorization: Bearer <service role key>`.

## 3. Install, seed and run

```bash
cd backend && npm install && npm run seed     # demo users, spots, bookings, chats, reviews
cd ../frontend && npm install && npm run dev  # http://localhost:8000
```

Every seeded account uses the password `Sahayatri@123`. For example:
- `vinayak.traveler@sahayatri.dev`: sign in under *Explore as Traveler*
- `guide.jaipur@sahayatri.dev`: sign in under *Earn as Guide*

The seed script prints every account. Re-running it reuses existing users and spots, but adds duplicate bookings, trips and messages.

## Testing

```bash
cd frontend
npm run lint
npm run typecheck
npm run test          # Vitest + Testing Library (mocked Supabase)
npx playwright test   # end-to-end; needs a seeded project and the dev server

cd ../backend
npm test              # applies all migrations to in-memory PostgreSQL and tests every security rule
```

The database tests use [PGlite](https://pglite.dev) (real PostgreSQL 17 compiled to
WebAssembly), so they need no Docker. Each test switches to the same role PostgREST
uses (`anon`, `authenticated` or `service_role`) and checks what that role can and
cannot do. CI runs all of the above on every push and pull request to `main`.

## Deployment

- **Frontend:** Vercel project rooted at `frontend/` (`vercel.json` rewrites every route to the SPA). Set the `VITE_*` variables in Vercel.
- **Database:** `supabase db push` from `backend/` applies only the migrations that aren't applied yet.
- **Edge functions:** `supabase functions deploy` from `backend/`.

Apply database migrations **before** deploying a frontend that depends on them.

## Troubleshooting

- **"Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY":** create `frontend/.env.local`, then restart `npm run dev`.
- **"permission denied for table profiles":** a query selected `*` or `email` from `profiles`. Emails are private: select explicit columns (see `PROFILE_COLUMNS` in `AuthContext.tsx`). Admins read emails from `admin_profiles`.
- **"Booking status cannot change from … to …":** the database only allows real transitions:
  - the guide accepts or declines a pending request;
  - the traveller cancels a pending or accepted booking, or completes the trip on or after its date;
  - only the payment system confirms or refunds.
- **Explore or Map shows nothing:** the migrations or the seed haven't been run against this project. Spots also only appear once their guide is verified.
- **Password reset or Google sign-in redirects to localhost:** set the Site URL and Redirect URLs (step 1).
- **Realtime updates don't arrive:** check **Database → Replication**. `messages`, `bookings` and `notifications` must be in the `supabase_realtime` publication (the baseline migration adds them).
- **The project is unreachable:** free-tier Supabase projects pause after about 7 days without traffic. Restore the project from the dashboard.
