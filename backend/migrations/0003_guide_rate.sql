-- Adds a real per-day rate field for guides, replacing the hardcoded
-- "₹2,000/day" that used to be shown everywhere in the UI.
-- Paste into the Supabase SQL Editor and run.

alter table public.profiles add column if not exists rate_per_day numeric;
