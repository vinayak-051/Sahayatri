-- Prevents the same email from ending up with two separate profiles (one
-- traveler, one guide) when someone signs up with email/password and then
-- separately with Google using the same address — Supabase does not link
-- identities across providers by default, so each method creates its own
-- auth.users row unless this constraint blocks the second one.
--
-- IMPORTANT: if you already have duplicate emails (e.g. one traveler + one
-- guide profile sharing the same email), run the SELECT below FIRST and
-- resolve them before running the CREATE UNIQUE INDEX, or it will fail.

-- 1. Find existing duplicates (read-only, safe to run anytime):
-- select email, array_agg(id) as profile_ids, array_agg(role) as roles
-- from public.profiles
-- group by lower(email)
-- having count(*) > 1;

-- 2. For each duplicate found, decide which account to keep, then delete the
--    other one from Authentication -> Users in the Supabase dashboard (NOT
--    by deleting the profiles row directly) — deleting the auth.users row
--    cascades and cleanly removes its profile too.

-- 3. Once there are no duplicates left, run this:
create unique index if not exists profiles_email_unique_idx on public.profiles (lower(email));
