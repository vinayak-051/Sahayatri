-- Supports the booking-platform fixes batch:
-- 1. is_verified — guides no longer show a hardcoded "VERIFIED" badge.
--    Defaults to false; flip a guide's row to true manually in the Supabase
--    Table Editor (Authentication/admin tooling for this doesn't exist yet)
--    once you've actually verified their identity.
-- 2. price_per_person — structured numeric price, replacing the old approach
--    of regex-parsing a number out of the free-text `pricing` display string.
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.locations add column if not exists price_per_person numeric;

-- reports: let a guide see (and dismiss) reports filed against their own
-- locations, instead of reports only being visible via direct DB access.
drop policy if exists "reports_select_own_location" on public.reports;
create policy "reports_select_own_location" on public.reports
  for select using (
    exists (select 1 from public.locations l where l.id = location_id and l.guide_id = auth.uid())
  );
drop policy if exists "reports_update_own_location" on public.reports;
create policy "reports_update_own_location" on public.reports
  for update using (
    exists (select 1 from public.locations l where l.id = location_id and l.guide_id = auth.uid())
  );

-- bookings status changes (accept/decline/cancel) need to push live to the
-- traveler's Trips page and the guide's dashboard — only `messages` was
-- added to the realtime publication in 0001_init.sql.
alter publication supabase_realtime add table public.bookings;
