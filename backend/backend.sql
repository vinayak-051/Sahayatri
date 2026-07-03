-- =============================================================================
-- Sahayatri Journeys — complete backend schema
-- Run once on a fresh Supabase project via the SQL Editor.
-- Consolidates migrations 0001–0014.
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- TABLES
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('traveler', 'guide')),
  profile_photo_url text,
  city text,
  additional_cities text[] default '{}',
  languages text[] default '{}',
  specialization text,
  bio text,
  rating numeric(3,2) default 0,
  rate_per_day numeric,
  is_available boolean default true,
  is_verified boolean not null default false,
  is_admin boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz default now()
);

-- Separate admin lookup table (no RLS) used by is_admin() to avoid
-- self-referential recursion in profiles policies.
create table public.admin_lookup (
  user_id uuid primary key references auth.users(id) on delete cascade
);

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
  price_per_person numeric,
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

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.profiles(id) on delete cascade,
  guide_id uuid not null references public.profiles(id) on delete cascade,
  destination text not null,
  date date not null,
  people int default 1,
  amount numeric not null check (amount >= 0),
  status text default 'pending' check (status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  feedback text default '',
  created_at timestamptz default now()
);

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

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz default now(),
  unique (guide_id, reviewer_id)
);

create table public.location_reviews (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz default now(),
  unique (location_id, reviewer_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  reported_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  description text,
  status text default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled', 'new_message')),
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

create unique index profiles_email_unique_idx on public.profiles (lower(email));
create index locations_guide_id_idx on public.locations(guide_id);
create index locations_category_idx on public.locations(category);
create index locations_status_idx on public.locations(status);
create index bookings_traveler_id_idx on public.bookings(traveler_id);
create index bookings_guide_id_idx on public.bookings(guide_id);
create unique index bookings_guide_date_accepted on public.bookings(guide_id, date) where status = 'accepted';
create index buddy_requests_trip_id_idx on public.buddy_requests(trip_id);
create index messages_sender_id_idx on public.messages(sender_id);
create index messages_receiver_id_idx on public.messages(receiver_id);
create index reviews_guide_id_idx on public.reviews(guide_id);
create index location_reviews_location_id_idx on public.location_reviews(location_id);
create index reports_location_id_idx on public.reports(location_id);
create index notifications_user_id_idx on public.notifications(user_id);
create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- =============================================================================
-- VIEWS
-- =============================================================================

create view public.guide_rating_stats
with (security_invoker = true) as
select guide_id, count(*) as reviews_count, round(avg(rating)::numeric, 2) as avg_rating
from public.reviews
group by guide_id;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Auto-create profile on signup
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

-- Sync guide rating from reviews
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

-- Sync location rating from location_reviews
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

-- Notification triggers
create or replace function public.notify_booking_requested()
returns trigger as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.guide_id,
    'booking_requested',
    'New booking request',
    coalesce((select name from public.profiles where id = new.traveler_id), 'A traveler') || ' requested a trip to ' || new.destination,
    jsonb_build_object('booking_id', new.id)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_booking_requested
  after insert on public.bookings
  for each row when (new.status = 'pending')
  execute procedure public.notify_booking_requested();

create or replace function public.notify_booking_status_change()
returns trigger as $$
declare
  guide_name text;
begin
  if new.status = old.status then return new; end if;
  if new.status in ('accepted', 'declined') then
    select name into guide_name from public.profiles where id = new.guide_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.traveler_id,
      case when new.status = 'accepted' then 'booking_accepted' else 'booking_declined' end,
      case when new.status = 'accepted' then 'Booking confirmed' else 'Booking declined' end,
      coalesce(guide_name, 'Your guide') || (case when new.status = 'accepted' then ' accepted' else ' declined' end) || ' your trip to ' || new.destination,
      jsonb_build_object('booking_id', new.id)
    );
  elsif new.status = 'cancelled' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      case when auth.uid() = new.traveler_id then new.guide_id else new.traveler_id end,
      'booking_cancelled',
      'Booking cancelled',
      'The trip to ' || new.destination || ' was cancelled',
      jsonb_build_object('booking_id', new.id)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_booking_status_change
  after update of status on public.bookings
  for each row execute procedure public.notify_booking_status_change();

create or replace function public.notify_new_message()
returns trigger as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.receiver_id,
    'new_message',
    'New message',
    coalesce((select name from public.profiles where id = new.sender_id), 'Someone') || ' sent you a message',
    jsonb_build_object('sender_id', new.sender_id)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_new_message
  after insert on public.messages
  for each row execute procedure public.notify_new_message();

-- Prevent unverified guides from having bookings accepted
create or replace function public.check_guide_verified_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' then
    if not exists (select 1 from public.profiles where id = new.guide_id and is_verified = true) then
      raise exception 'Guide is not verified and cannot accept bookings';
    end if;
  end if;
  return new;
end;
$$;

create trigger booking_guide_verified_check
  before insert or update on public.bookings
  for each row execute function public.check_guide_verified_on_booking();

-- Admin check via admin_lookup (no RLS, no recursion)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_lookup where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated;

-- Admin guide verification with audit log
create or replace function public.admin_verify_guide(p_guide_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;
  update public.profiles set is_verified = p_verified where id = p_guide_id;
  insert into public.admin_actions(admin_id, action, target_id, details)
  values (
    auth.uid(),
    case when p_verified then 'verify_guide' else 'unverify_guide' end,
    p_guide_id,
    jsonb_build_object('is_verified', p_verified)
  );
end;
$$;

grant execute on function public.admin_verify_guide(uuid, boolean) to authenticated;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.bookings enable row level security;
alter table public.buddy_trips enable row level security;
alter table public.buddy_requests enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.location_reviews enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.admin_actions enable row level security;
-- admin_lookup has NO RLS — intentionally queryable from within policies

-- PROFILES
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_select_guides" on public.profiles
  for select using (role = 'guide' and auth.uid() is not null);
create policy "profiles_select_booking_parties" on public.profiles
  for select using (
    auth.uid() is not null and
    exists (
      select 1 from public.bookings
      where (bookings.traveler_id = auth.uid() and bookings.guide_id = profiles.id)
         or (bookings.guide_id = auth.uid() and bookings.traveler_id = profiles.id)
    )
  );
create policy "profiles_select_message_parties" on public.profiles
  for select using (
    auth.uid() is not null and
    exists (
      select 1 from public.messages
      where (messages.sender_id = auth.uid() and messages.receiver_id = profiles.id)
         or (messages.receiver_id = auth.uid() and messages.sender_id = profiles.id)
    )
  );
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_admin());

-- LOCATIONS
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

-- BOOKINGS
create policy "bookings_select_participants" on public.bookings
  for select using (traveler_id = auth.uid() or guide_id = auth.uid());
create policy "bookings_select_admin" on public.bookings
  for select using (public.is_admin());
create policy "bookings_insert_as_traveler" on public.bookings
  for insert with check (traveler_id = auth.uid());
create policy "bookings_update_participants" on public.bookings
  for update using (traveler_id = auth.uid() or guide_id = auth.uid());

-- BUDDY TRIPS
create policy "buddy_trips_select_all" on public.buddy_trips for select using (true);
create policy "buddy_trips_insert_own" on public.buddy_trips for insert with check (user_id = auth.uid());
create policy "buddy_trips_update_own" on public.buddy_trips for update using (user_id = auth.uid());
create policy "buddy_trips_delete_own" on public.buddy_trips for delete using (user_id = auth.uid());

-- BUDDY REQUESTS
create policy "buddy_requests_select_involved" on public.buddy_requests
  for select using (
    traveler_id = auth.uid()
    or exists (select 1 from public.buddy_trips t where t.id = trip_id and t.user_id = auth.uid())
  );
create policy "buddy_requests_select_admin" on public.buddy_requests
  for select using (public.is_admin());
create policy "buddy_requests_insert_as_traveler" on public.buddy_requests
  for insert with check (traveler_id = auth.uid());
create policy "buddy_requests_update_trip_owner" on public.buddy_requests
  for update using (
    exists (select 1 from public.buddy_trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- MESSAGES
create policy "messages_select_participants" on public.messages
  for select using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "messages_insert_as_sender" on public.messages
  for insert with check (sender_id = auth.uid());
create policy "messages_update_receiver" on public.messages
  for update using (receiver_id = auth.uid());

-- REVIEWS
create policy "reviews_select_all" on public.reviews for select using (true);
create policy "reviews_insert_completed_booking" on public.reviews
  for insert with check (
    auth.uid() = reviewer_id and
    exists (
      select 1 from public.bookings
      where bookings.traveler_id = auth.uid()
        and bookings.guide_id = reviews.guide_id
        and bookings.status = 'completed'
    )
  );

-- LOCATION REVIEWS
create policy "location_reviews_select_all" on public.location_reviews for select using (true);
create policy "location_reviews_insert_as_traveler" on public.location_reviews
  for insert with check (
    reviewer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'traveler')
  );

-- REPORTS
create policy "reports_select_own" on public.reports for select using (reported_by = auth.uid());
create policy "reports_insert_own" on public.reports for insert with check (reported_by = auth.uid());
create policy "reports_select_own_location" on public.reports
  for select using (
    exists (select 1 from public.locations l where l.id = location_id and l.guide_id = auth.uid())
  );
create policy "reports_update_own_location" on public.reports
  for update using (
    exists (select 1 from public.locations l where l.id = location_id and l.guide_id = auth.uid())
  );

-- NOTIFICATIONS
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- PUSH SUBSCRIPTIONS
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (user_id = auth.uid());
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- ADMIN ACTIONS
create policy "admin_actions_select_admin" on public.admin_actions
  for select using (public.is_admin());

-- =============================================================================
-- STORAGE
-- =============================================================================

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('location-media', 'location-media', true) on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_owner_insert" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_update" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_delete" on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "location_media_public_read" on storage.objects for select using (bucket_id = 'location-media');
create policy "location_media_owner_insert" on storage.objects for insert with check (bucket_id = 'location-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "location_media_owner_update" on storage.objects for update using (bucket_id = 'location-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "location_media_owner_delete" on storage.objects for delete using (bucket_id = 'location-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- REALTIME
-- =============================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.notifications;

-- =============================================================================
-- AFTER RUNNING:
-- Add yourself as admin:
--   INSERT INTO public.admin_lookup (user_id)
--   SELECT id FROM public.profiles WHERE email = 'your@email.com';
--   UPDATE public.profiles SET is_admin = true WHERE email = 'your@email.com';
-- =============================================================================
