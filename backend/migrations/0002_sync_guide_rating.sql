-- Keeps profiles.rating in sync with the real review average, since most
-- pages (Guides list, GuideDetail, LocationDetail, MapView) read
-- profiles.rating directly rather than joining guide_rating_stats.
-- Paste into the Supabase SQL Editor and run.

create or replace function public.sync_guide_rating()
returns trigger as $$
declare
  target_guide_id uuid;
begin
  target_guide_id := coalesce(new.guide_id, old.guide_id);

  update public.profiles
  set rating = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where guide_id = target_guide_id), 0)
  where id = target_guide_id;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_review_change_sync_rating on public.reviews;
create trigger on_review_change_sync_rating
  after insert or update or delete on public.reviews
  for each row execute procedure public.sync_guide_rating();

-- Backfill existing reviews (e.g. the ones from your seed data) immediately.
update public.profiles p
set rating = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.guide_id = p.id), 0)
where p.role = 'guide';
