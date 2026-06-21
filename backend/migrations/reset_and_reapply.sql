-- One-shot reset + reapply for 0001_init.sql.
-- Safe to run even if the previous attempt only partially completed —
-- it drops anything that might already exist before recreating everything.
-- Paste this entire file into the Supabase SQL Editor and click "Run".

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop trigger if exists on_review_change_sync_rating on public.reviews;
drop function if exists public.sync_guide_rating();
drop view if exists public.guide_rating_stats;
drop table if exists public.reports cascade;
drop table if exists public.reviews cascade;
drop table if exists public.messages cascade;
drop table if exists public.buddy_requests cascade;
drop table if exists public.buddy_trips cascade;
drop table if exists public.bookings cascade;
drop table if exists public.locations cascade;
drop table if exists public.profiles cascade;
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;
drop policy if exists "location_media_public_read" on storage.objects;
drop policy if exists "location_media_owner_insert" on storage.objects;
drop policy if exists "location_media_owner_update" on storage.objects;
drop policy if exists "location_media_owner_delete" on storage.objects;

-- =========================================================================
-- Everything below is identical to backend/migrations/0001_init.sql
-- =========================================================================

create extension if not exists "pgcrypto";

-- =========================================================================
-- PROFILES (extends auth.users — one row per traveler or guide)
-- =========================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('traveler', 'guide')),
  profile_photo_url text,
  city text,
  -- additional cities a guide operates in, beyond their primary `city`
  additional_cities text[] default '{}',
  languages text[] default '{}',
  specialization text,
  bio text,
  rating numeric(3,2) default 0,
  -- guide's day rate in INR; null until the guide sets one (shown as
  -- "Contact for pricing" rather than a fake number)
  rate_per_day numeric,
  is_available boolean default true,
  -- true once the user has explicitly picked a role (always true for
  -- email/password signups; false for Google OAuth signups until they
  -- complete the /complete-profile step, since OAuth carries no role).
  onboarded boolean not null default false,
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever someone signs up via Supabase Auth
-- (email/password or OAuth). Role/name/etc. come from signUp options.data
-- or, for OAuth users with no metadata yet, default to 'traveler' until
-- they complete the role-selection step in the app.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role, city, languages, specialization, bio, onboarded)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'traveler'),
    new.raw_user_meta_data->>'city',
    case when new.raw_user_meta_data->>'languages' is not null
      then string_to_array(new.raw_user_meta_data->>'languages', ',')
      else '{}'::text[]
    end,
    new.raw_user_meta_data->>'specialization',
    new.raw_user_meta_data->>'bio',
    (new.raw_user_meta_data->>'role' is not null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- LOCATIONS (guide-authored listings)
-- =========================================================================
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_description text not null,
  detailed_content text not null,
  lat double precision not null,
  lng double precision not null,
  category text not null,
  tags text[] default '{}',
  best_visiting_time text,
  pricing text,
  timings text,
  safety_level text default 'moderate' check (safety_level in ('high', 'moderate', 'low')),
  difficulty text default 'easy' check (difficulty in ('easy', 'moderate', 'hard')),
  guide_id uuid not null references public.profiles(id) on delete cascade,
  photos text[] default '{}',
  videos text[] default '{}',
  rating numeric(3,2) default 0,
  reviews_count int default 0,
  status text default 'active' check (status in ('active', 'draft', 'archived')),
  saves_count int default 0,
  views_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index locations_guide_id_idx on public.locations(guide_id);
create index locations_category_idx on public.locations(category);
create index locations_status_idx on public.locations(status);

-- =========================================================================
-- BOOKINGS
-- =========================================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.profiles(id) on delete cascade,
  guide_id uuid not null references public.profiles(id) on delete cascade,
  destination text not null,
  date date not null,
  people int default 1,
  amount numeric not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  feedback text default '',
  created_at timestamptz default now()
);

create index bookings_traveler_id_idx on public.bookings(traveler_id);
create index bookings_guide_id_idx on public.bookings(guide_id);

-- =========================================================================
-- BUDDY TRIPS + BUDDY REQUESTS
-- =========================================================================
create table public.buddy_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  destination text not null,
  start_date date not null,
  end_date date not null,
  budget text,
  description text,
  created_at timestamptz default now()
);

create table public.buddy_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.buddy_trips(id) on delete cascade,
  traveler_id uuid not null references public.profiles(id) on delete cascade,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now(),
  unique (trip_id, traveler_id)
);

create index buddy_requests_trip_id_idx on public.buddy_requests(trip_id);

-- =========================================================================
-- MESSAGES (realtime chat, replaces Socket.io)
-- =========================================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index messages_sender_id_idx on public.messages(sender_id);
create index messages_receiver_id_idx on public.messages(receiver_id);

-- =========================================================================
-- REVIEWS (one review per traveler per guide, enforced at the DB level)
-- =========================================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz default now(),
  unique (guide_id, reviewer_id)
);

create index reviews_guide_id_idx on public.reviews(guide_id);

-- Computed guide rating stats (replaces the old hardcoded 4.9 in bookingController)
create view public.guide_rating_stats
with (security_invoker = true) as
select guide_id, count(*) as reviews_count, round(avg(rating)::numeric, 2) as avg_rating
from public.reviews
group by guide_id;

-- Most pages read profiles.rating directly (it's denormalized for cheap
-- public listing queries), so keep it in sync whenever reviews change.
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

create trigger on_review_change_sync_rating
  after insert or update or delete on public.reviews
  for each row execute procedure public.sync_guide_rating();

-- =========================================================================
-- REPORTS (location moderation — previously a no-op endpoint)
-- =========================================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  reported_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  description text,
  status text default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz default now()
);

create index reports_location_id_idx on public.reports(location_id);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.bookings enable row level security;
alter table public.buddy_trips enable row level security;
alter table public.buddy_requests enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

-- PROFILES: public read (needed to browse guides), self-only write
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);

-- LOCATIONS: public read of active listings, guide owns full CRUD on their own
create policy "locations_select_active_or_own" on public.locations
  for select using (status = 'active' or guide_id = auth.uid());
create policy "locations_insert_own_as_guide" on public.locations
  for insert with check (
    guide_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'guide')
  );
create policy "locations_update_own" on public.locations
  for update using (guide_id = auth.uid());
create policy "locations_delete_own" on public.locations
  for delete using (guide_id = auth.uid());

-- BOOKINGS: only the traveler and guide involved can see/act on a booking
create policy "bookings_select_participants" on public.bookings
  for select using (traveler_id = auth.uid() or guide_id = auth.uid());
create policy "bookings_insert_as_traveler" on public.bookings
  for insert with check (traveler_id = auth.uid());
create policy "bookings_update_participants" on public.bookings
  for update using (traveler_id = auth.uid() or guide_id = auth.uid());

-- BUDDY TRIPS: public discovery, owner-only write
create policy "buddy_trips_select_all" on public.buddy_trips for select using (true);
create policy "buddy_trips_insert_own" on public.buddy_trips for insert with check (user_id = auth.uid());
create policy "buddy_trips_update_own" on public.buddy_trips for update using (user_id = auth.uid());
create policy "buddy_trips_delete_own" on public.buddy_trips for delete using (user_id = auth.uid());

-- BUDDY REQUESTS: requester or trip owner can see/manage
create policy "buddy_requests_select_involved" on public.buddy_requests
  for select using (
    traveler_id = auth.uid()
    or exists (select 1 from public.buddy_trips t where t.id = trip_id and t.user_id = auth.uid())
  );
create policy "buddy_requests_insert_as_traveler" on public.buddy_requests
  for insert with check (traveler_id = auth.uid());
create policy "buddy_requests_update_trip_owner" on public.buddy_requests
  for update using (
    exists (select 1 from public.buddy_trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- MESSAGES: only sender/receiver can read; sender can write; receiver can mark read
create policy "messages_select_participants" on public.messages
  for select using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "messages_insert_as_sender" on public.messages
  for insert with check (sender_id = auth.uid());
create policy "messages_update_receiver" on public.messages
  for update using (receiver_id = auth.uid());

-- REVIEWS: public read, traveler-only insert, one per guide enforced by unique index above
create policy "reviews_select_all" on public.reviews for select using (true);
create policy "reviews_insert_as_traveler" on public.reviews
  for insert with check (
    reviewer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'traveler')
  );

-- REPORTS: reporter can file and view their own; no public read (moderation queue
-- is reviewed by the project owner via the Supabase dashboard / service role until
-- an admin role exists)
create policy "reports_select_own" on public.reports for select using (reported_by = auth.uid());
create policy "reports_insert_own" on public.reports for insert with check (reported_by = auth.uid());

-- =========================================================================
-- STORAGE BUCKETS (avatars + location media)
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('location-media', 'location-media', true)
on conflict (id) do nothing;

-- Files are uploaded under a path like `${auth.uid()}/filename.jpg` so ownership
-- can be checked from the first path segment.
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_owner_insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "location_media_public_read" on storage.objects
  for select using (bucket_id = 'location-media');
create policy "location_media_owner_insert" on storage.objects
  for insert with check (bucket_id = 'location-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "location_media_owner_update" on storage.objects
  for update using (bucket_id = 'location-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "location_media_owner_delete" on storage.objects
  for delete using (bucket_id = 'location-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================================
-- REALTIME (live message delivery — replaces the old Socket.io server)
-- =========================================================================
alter publication supabase_realtime add table public.messages;
