-- Location reviews: travelers can rate/review a specific location/listing,
-- separate from guide reviews (public.reviews). Keeps locations.rating and
-- locations.reviews_count (already in 0001_init.sql) in sync automatically.
create table public.location_reviews (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz default now(),
  unique (location_id, reviewer_id)
);

create index location_reviews_location_id_idx on public.location_reviews(location_id);

alter table public.location_reviews enable row level security;

create policy "location_reviews_select_all" on public.location_reviews for select using (true);
create policy "location_reviews_insert_as_traveler" on public.location_reviews
  for insert with check (
    reviewer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'traveler')
  );

create or replace function public.sync_location_rating()
returns trigger as $$
declare
  target_location_id uuid;
begin
  target_location_id := coalesce(new.location_id, old.location_id);
  update public.locations
  set rating = coalesce((select round(avg(rating)::numeric, 2) from public.location_reviews where location_id = target_location_id), 0),
      reviews_count = (select count(*) from public.location_reviews where location_id = target_location_id)
  where id = target_location_id;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_location_review_change_sync_rating
  after insert or update or delete on public.location_reviews
  for each row execute procedure public.sync_location_rating();
