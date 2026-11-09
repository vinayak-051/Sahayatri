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
  status text default 'pending' check (status in ('pending', 'accepted', 'confirmed', 'declined', 'completed', 'cancelled')),
  final_payment_mode text check (final_payment_mode in ('online', 'cash')),
  cancellation_fee numeric default 0,
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
create unique index bookings_guide_date_accepted on public.bookings(guide_id, date) where status in ('accepted', 'confirmed');
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
  traveler_name text;
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
  elsif new.status = 'confirmed' then
    select name into traveler_name from public.profiles where id = new.traveler_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.guide_id,
      'booking_advance_paid',
      'Advance received',
      coalesce(traveler_name, 'A traveler') || ' paid the 50% advance for the trip to ' || new.destination,
      jsonb_build_object('booking_id', new.id)
    );
  elsif new.status = 'cancelled' then
    -- cancellations via the payments Edge Function run as service role
    -- (auth.uid() is null), and those are always traveler-initiated
    insert into public.notifications (user_id, type, title, body, data)
    values (
      case when auth.uid() = new.guide_id then new.traveler_id else new.guide_id end,
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
-- PAYMENTS (see migrations/0018_payments.sql)
-- 50% advance online via Razorpay, 50% final online or cash to guide.
-- Cancelling within 5 days of the trip forfeits 10% of the total (platform
-- revenue). Money writes happen only via Edge Functions (service role).
-- =============================================================================

-- One row per Razorpay order; amounts in rupees
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  stage text not null check (stage in ('advance', 'final')),
  razorpay_order_id text unique not null,
  razorpay_payment_id text,
  amount numeric not null check (amount > 0),
  status text default 'created' check (status in ('created', 'paid', 'refunded')),
  refund_amount numeric default 0,
  created_at timestamptz default now()
);
create index payments_booking_id_idx on public.payments(booking_id);

-- Append-only ledger of what the platform owes each guide.
-- positive = credit (earning), negative = debit (commission, payout).
-- Cancellation fees never hit this table: they are platform revenue.
create table public.guide_ledger (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  type text not null check (type in ('earning', 'commission', 'payout')),
  amount numeric not null,
  created_at timestamptz default now()
);
create index guide_ledger_guide_id_idx on public.guide_ledger(guide_id);

alter table public.payments enable row level security;
alter table public.guide_ledger enable row level security;

create policy "payments_select_participants" on public.payments
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and (b.traveler_id = auth.uid() or b.guide_id = auth.uid())
    )
  );
-- no insert/update policies on payments or guide_ledger: service role only

create policy "guide_ledger_select_own" on public.guide_ledger
  for select using (guide_id = auth.uid());

-- Payment state can only move via the Edge Functions (service role); otherwise a
-- traveler could mark themselves paid or dodge the cancellation fee.
create or replace function public.guard_booking_payment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    raise exception 'Bookings are confirmed only after the advance payment succeeds';
  end if;
  if new.final_payment_mode is distinct from old.final_payment_mode then
    raise exception 'final_payment_mode is set by the payment system';
  end if;
  if new.cancellation_fee is distinct from old.cancellation_fee then
    raise exception 'cancellation_fee is set by the payment system';
  end if;
  if old.status = 'confirmed' and new.status = 'cancelled' then
    raise exception 'Paid bookings must be cancelled through the cancellation flow so the refund is issued';
  end if;
  return new;
end;
$$;

create trigger guard_booking_payment_fields
  before update on public.bookings
  for each row execute function public.guard_booking_payment_fields();

-- =============================================================================
-- REALTIME
-- =============================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.notifications;

-- =============================================================================
-- MIGRATION 0014: NO SELF-BOOKING
-- =============================================================================

alter table public.bookings
  add constraint bookings_no_self_booking check (traveler_id <> guide_id);

-- =============================================================================
-- MIGRATION 0015: GUIDE VERIFICATION
-- =============================================================================

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('aadhaar', 'driving_license', 'passport', 'voter_id', 'other')),
  document_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_requests_guide_id_idx on public.verification_requests(guide_id);
create index verification_requests_status_idx on public.verification_requests(status);
create unique index verification_requests_one_pending on public.verification_requests(guide_id) where status = 'pending';

alter table public.verification_requests enable row level security;

create policy "verification_requests_select_own" on public.verification_requests
  for select using (guide_id = auth.uid());
create policy "verification_requests_insert_own" on public.verification_requests
  for insert with check (
    guide_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'guide')
  );
create policy "verification_requests_select_admin" on public.verification_requests
  for select using (public.is_admin());

create or replace function public.admin_review_verification(p_request_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_guide_id uuid;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  update public.verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id and status = 'pending'
   returning guide_id into v_guide_id;
  if v_guide_id is null then raise exception 'Request not found or already reviewed'; end if;
  if p_approve then update public.profiles set is_verified = true where id = v_guide_id; end if;
  insert into public.admin_actions(admin_id, action, target_id, details)
  values (auth.uid(), case when p_approve then 'approve_verification' else 'reject_verification' end,
    v_guide_id, jsonb_build_object('request_id', p_request_id, 'note', p_note));
end;
$$;

grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;

insert into storage.buckets (id, name, public) values ('verification-docs', 'verification-docs', false) on conflict (id) do nothing;
create policy "verification_docs_owner_insert" on storage.objects for insert with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "verification_docs_owner_read" on storage.objects for select using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "verification_docs_admin_read" on storage.objects for select using (bucket_id = 'verification-docs' and public.is_admin());

-- =============================================================================
-- MIGRATION 0016: MODERATION
-- =============================================================================

create policy "reports_select_admin" on public.reports for select using (public.is_admin());
create policy "reports_update_admin" on public.reports for update using (public.is_admin());
create policy "locations_select_admin" on public.locations for select using (public.is_admin());
create policy "locations_update_admin" on public.locations for update using (public.is_admin());
create policy "location_reviews_delete_admin" on public.location_reviews for delete using (public.is_admin());

alter table public.profiles add column is_banned boolean not null default false;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_banned() to authenticated;

create policy "messages_deny_banned" on public.messages as restrictive for insert with check (not public.is_banned());
create policy "bookings_deny_banned" on public.bookings as restrictive for insert with check (not public.is_banned());
create policy "locations_deny_banned" on public.locations as restrictive for insert with check (not public.is_banned());
create policy "location_reviews_deny_banned" on public.location_reviews as restrictive for insert with check (not public.is_banned());
create policy "buddy_trips_deny_banned" on public.buddy_trips as restrictive for insert with check (not public.is_banned());
create policy "reports_deny_banned" on public.reports as restrictive for insert with check (not public.is_banned());

create or replace function public.admin_set_banned(p_user_id uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  if exists (select 1 from public.admin_lookup where user_id = p_user_id) then raise exception 'Cannot ban an admin'; end if;
  update public.profiles set is_banned = p_banned where id = p_user_id;
  insert into public.admin_actions(admin_id, action, target_id, details)
  values (auth.uid(), case when p_banned then 'ban_user' else 'unban_user' end, p_user_id, '{}'::jsonb);
end;
$$;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;

-- =============================================================================
-- MIGRATION 0017: RATE LIMITS
-- =============================================================================

create or replace function public.rate_limit_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Rate limit exceeded: too many messages, slow down.';
  end if;
  return new;
end;
$$;
create trigger messages_rate_limit before insert on public.messages for each row execute function public.rate_limit_messages();

create or replace function public.rate_limit_bookings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.bookings where traveler_id = new.traveler_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Rate limit exceeded: too many booking requests today.';
  end if;
  return new;
end;
$$;
create trigger bookings_rate_limit before insert on public.bookings for each row execute function public.rate_limit_bookings();

create or replace function public.rate_limit_reports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where reported_by = new.reported_by and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Rate limit exceeded: too many reports today.';
  end if;
  return new;
end;
$$;
create trigger reports_rate_limit before insert on public.reports for each row execute function public.rate_limit_reports();

-- =============================================================================
-- MIGRATION 0019: SAVED LOCATIONS / WISHLIST
-- =============================================================================
-- Real per-user saved/wishlist tracking for locations. Replaces the
-- write-only locations.saves_count increment (which never recorded *who*
-- saved *what*, so it couldn't be un-saved or listed back to the user)
-- with a proper join table. saves_count is kept in sync via trigger so
-- existing UI reading it keeps working unchanged.

create table public.saved_locations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index saved_locations_location_id_idx on public.saved_locations(location_id);

alter table public.saved_locations enable row level security;

create policy "saved_locations_select_own" on public.saved_locations
  for select using (user_id = auth.uid());
create policy "saved_locations_insert_own" on public.saved_locations
  for insert with check (user_id = auth.uid());
create policy "saved_locations_delete_own" on public.saved_locations
  for delete using (user_id = auth.uid());

create or replace function public.sync_location_saves_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.locations set saves_count = saves_count + 1 where id = new.location_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.locations set saves_count = greatest(saves_count - 1, 0) where id = old.location_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger on_saved_location_insert
  after insert on public.saved_locations
  for each row execute procedure public.sync_location_saves_count();
create trigger on_saved_location_delete
  after delete on public.saved_locations
  for each row execute procedure public.sync_location_saves_count();

-- =============================================================================
-- AFTER RUNNING:
-- Add yourself as admin:
--   INSERT INTO public.admin_lookup (user_id)
--   SELECT id FROM public.profiles WHERE email = 'your@email.com';
--   UPDATE public.profiles SET is_admin = true WHERE email = 'your@email.com';
-- =============================================================================
