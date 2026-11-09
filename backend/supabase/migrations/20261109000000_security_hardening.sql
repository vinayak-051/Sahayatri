-- =============================================================================
-- Security and data-integrity hardening. See docs/AUDIT.md (B1–B11, C1–C3, D1–D3).
--
-- RLS decides WHICH ROWS a client may touch. This migration adds the missing
-- other half: column-level privileges (WHICH COLUMNS) and triggers for rules
-- that depend on old and new values (booking status transitions, pricing).
--
-- Safe to re-run. When you add a column to profiles, locations, bookings,
-- messages, buddy_requests or reports, also add it to the grants below.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B1. admin_lookup decides who is an admin; it must never be reachable via the API.
-- is_admin() is SECURITY DEFINER (runs as the table owner, which bypasses RLS),
-- so enabling RLS with no policies does not affect it.
-- -----------------------------------------------------------------------------
alter table public.admin_lookup enable row level security;
revoke all on table public.admin_lookup from anon, authenticated;

-- -----------------------------------------------------------------------------
-- B2 / B4. Profiles: users edit only their own profile fields, and nobody else
-- can read their email. Admins read emails through admin_profiles.
-- -----------------------------------------------------------------------------
revoke select, insert, update on table public.profiles from anon, authenticated;

grant select (id, name, role, profile_photo_url, city, additional_cities, languages,
              specialization, bio, rating, rate_per_day, is_available, is_verified,
              is_admin, is_banned, onboarded, created_at)
  on public.profiles to anon, authenticated;

grant insert (id, email, name, role, profile_photo_url, city, additional_cities, languages,
              specialization, bio, onboarded)
  on public.profiles to authenticated;

grant update (name, profile_photo_url, city, additional_cities, languages, specialization,
              bio, rate_per_day, is_available, role, onboarded)
  on public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_rate_non_negative;
alter table public.profiles add constraint profiles_rate_non_negative
  check (rate_per_day is null or rate_per_day >= 0) not valid;

-- Role is chosen once, during onboarding; onboarding cannot be undone.
-- SECURITY INVOKER on purpose: current_user is the client role for direct writes,
-- and the owner for writes made inside SECURITY DEFINER functions (admin tools,
-- rating sync), which must not be restricted.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.role is distinct from old.role and old.onboarded then
    raise exception 'Role cannot be changed after onboarding' using errcode = '42501';
  end if;
  if old.onboarded and not new.onboarded then
    raise exception 'Onboarding cannot be undone' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Admin-only view with the private columns. A plain view runs with its owner's
-- privileges, so the is_admin() filter is the access check.
create or replace view public.admin_profiles with (security_barrier = true) as
  select id, email, name, role, city, profile_photo_url, rating, rate_per_day, specialization,
         is_verified, is_banned, is_admin, is_available, onboarded, created_at
  from public.profiles
  where public.is_admin();

revoke all on public.admin_profiles from public, anon;
grant select on public.admin_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- C3 / D3. Locations: a real city, valid coordinates and prices, guides edit only
-- content fields (not ratings or counters), and an atomic view counter.
-- -----------------------------------------------------------------------------
alter table public.locations add column if not exists city text;
update public.locations l
   set city = p.city
  from public.profiles p
 where p.id = l.guide_id and l.city is null;

alter table public.locations drop constraint if exists locations_coordinates_valid;
alter table public.locations add constraint locations_coordinates_valid
  check (lat between -90 and 90 and lng between -180 and 180) not valid;
alter table public.locations drop constraint if exists locations_price_non_negative;
alter table public.locations add constraint locations_price_non_negative
  check (price_per_person is null or price_per_person >= 0) not valid;

revoke insert, update on table public.locations from anon, authenticated;
grant insert (guide_id, title, short_description, detailed_content, lat, lng, city, category,
              tags, best_visiting_time, pricing, price_per_person, timings, safety_level,
              difficulty, photos, videos, status)
  on public.locations to authenticated;
grant update (title, short_description, detailed_content, lat, lng, city, category, tags,
              best_visiting_time, pricing, price_per_person, timings, safety_level, difficulty,
              photos, videos, status)
  on public.locations to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

create or replace function public.increment_location_views(p_location_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.locations
     set views_count = coalesce(views_count, 0) + 1
   where id = p_location_id and status = 'active';
$$;

revoke all on function public.increment_location_views(uuid) from public;
grant execute on function public.increment_location_views(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- B3 / C1 / C2. Bookings: the server prices a booking, clients can only create
-- pending requests, and only the allowed status transitions succeed.
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists bookings_location_id_idx on public.bookings(location_id);

alter table public.bookings drop constraint if exists bookings_people_range;
alter table public.bookings add constraint bookings_people_range
  check (people between 1 and 20) not valid;

create or replace function public.prepare_booking()
returns trigger language plpgsql set search_path = public as $$
declare
  v_guide_id uuid;
  v_title text;
  v_status text;
  v_price numeric;
  v_rate numeric;
  v_guide_ok boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;   -- service role (seed, payments) and SECURITY DEFINER code
  end if;

  -- Clients only ever create pending requests; money and payment fields are server-owned.
  new.status := 'pending';
  new.final_payment_mode := null;
  new.cancellation_fee := 0;
  new.feedback := '';
  new.created_at := now();

  if new.traveler_id is distinct from auth.uid() then
    raise exception 'You can only request bookings for yourself' using errcode = '42501';
  end if;
  if new.date < current_date then
    raise exception 'Trip date cannot be in the past' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = new.traveler_id and role = 'traveler') then
    raise exception 'Only travellers can request bookings' using errcode = '42501';
  end if;

  if new.location_id is not null then
    select guide_id, title, status, price_per_person
      into v_guide_id, v_title, v_status, v_price
      from public.locations where id = new.location_id;
    if v_guide_id is null or v_status <> 'active' then
      raise exception 'This spot is not available for booking' using errcode = '22023';
    end if;
    new.guide_id := v_guide_id;
    new.destination := v_title;
    new.amount := coalesce(v_price, 0) * new.people;
  else
    select rate_per_day into v_rate
      from public.profiles where id = new.guide_id and role = 'guide';
    new.amount := coalesce(v_rate, 0) * new.people;
  end if;

  select is_verified and coalesce(is_available, true) and not is_banned
    into v_guide_ok
    from public.profiles where id = new.guide_id and role = 'guide';
  if not coalesce(v_guide_ok, false) then
    raise exception 'This guide is not accepting bookings right now' using errcode = '22023';
  end if;

  return new;
end $$;

drop trigger if exists prepare_booking on public.bookings;
create trigger prepare_booking
  before insert on public.bookings
  for each row execute function public.prepare_booking();

-- Verification matters when a guide accepts. New client requests are always
-- pending (and prepare_booking already refuses unverified guides), so this
-- check no longer needs to run on insert, where it fired before prepare_booking.
drop trigger if exists booking_guide_verified_check on public.bookings;
create trigger booking_guide_verified_check
  before update on public.bookings
  for each row execute function public.check_guide_verified_on_booking();

-- Replaces guard_booking_payment_fields with a full transition check.
create or replace function public.enforce_booking_update()
returns trigger language plpgsql set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_guide boolean := v_uid is not null and v_uid = old.guide_id;
  v_is_traveler boolean := v_uid is not null and v_uid = old.traveler_id;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;   -- service role (payment functions) and SECURITY DEFINER code
  end if;

  if new.traveler_id is distinct from old.traveler_id
     or new.guide_id is distinct from old.guide_id
     or new.location_id is distinct from old.location_id
     or new.destination is distinct from old.destination
     or new.date is distinct from old.date
     or new.people is distinct from old.people
     or new.amount is distinct from old.amount
     or new.created_at is distinct from old.created_at then
    raise exception 'Booking details cannot be changed after the request is sent' using errcode = '42501';
  end if;
  if new.final_payment_mode is distinct from old.final_payment_mode then
    raise exception 'final_payment_mode is set by the payment system' using errcode = '42501';
  end if;
  if new.cancellation_fee is distinct from old.cancellation_fee then
    raise exception 'cancellation_fee is set by the payment system' using errcode = '42501';
  end if;
  if new.feedback is distinct from old.feedback and not v_is_traveler then
    raise exception 'Only the traveller can leave trip feedback' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      raise exception 'Bookings are confirmed only after the advance payment succeeds' using errcode = '42501';
    elsif old.status = 'confirmed' and new.status = 'cancelled' then
      raise exception 'Paid bookings must be cancelled through the cancellation flow so the refund is issued' using errcode = '42501';
    elsif v_is_guide and old.status = 'pending' and new.status in ('accepted', 'declined') then
      null;
    elsif v_is_traveler and old.status in ('pending', 'accepted') and new.status = 'cancelled' then
      null;
    elsif v_is_traveler and old.status in ('accepted', 'confirmed') and new.status = 'completed' then
      if old.date > current_date then
        raise exception 'A trip can be marked completed only on or after its date' using errcode = '22023';
      end if;
    else
      raise exception 'Booking status cannot change from % to %', old.status, new.status using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists guard_booking_payment_fields on public.bookings;
drop function if exists public.guard_booking_payment_fields();
drop trigger if exists enforce_booking_update on public.bookings;
create trigger enforce_booking_update
  before update on public.bookings
  for each row execute function public.enforce_booking_update();

revoke update on table public.bookings from anon, authenticated;
grant update (status, feedback) on public.bookings to authenticated;

-- -----------------------------------------------------------------------------
-- B5 / C2. Messages: the receiver may only mark messages read. No empty, huge
-- or self-addressed messages. Notifications: only the read flag is writable.
-- -----------------------------------------------------------------------------
revoke update on table public.messages from anon, authenticated;
grant update (is_read) on public.messages to authenticated;

alter table public.messages drop constraint if exists messages_content_length;
alter table public.messages add constraint messages_content_length
  check (char_length(btrim(content)) between 1 and 2000) not valid;
alter table public.messages drop constraint if exists messages_no_self;
alter table public.messages add constraint messages_no_self
  check (sender_id <> receiver_id) not valid;

revoke update on table public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- B6 / C2. Buddy trips are visible to signed-in users only; dates must make
-- sense; you cannot ask to join your own trip; owners change only the status.
-- -----------------------------------------------------------------------------
drop policy if exists "buddy_trips_select_all" on public.buddy_trips;
drop policy if exists "buddy_trips_select_authenticated" on public.buddy_trips;
create policy "buddy_trips_select_authenticated" on public.buddy_trips
  for select using (auth.uid() is not null);

alter table public.buddy_trips drop constraint if exists buddy_trips_dates_valid;
alter table public.buddy_trips add constraint buddy_trips_dates_valid
  check (end_date >= start_date) not valid;

drop policy if exists "buddy_requests_insert_as_traveler" on public.buddy_requests;
create policy "buddy_requests_insert_as_traveler" on public.buddy_requests
  for insert with check (
    traveler_id = auth.uid()
    and not exists (select 1 from public.buddy_trips t where t.id = trip_id and t.user_id = auth.uid())
  );

drop policy if exists "buddy_requests_deny_banned" on public.buddy_requests;
create policy "buddy_requests_deny_banned" on public.buddy_requests
  as restrictive for insert with check (not public.is_banned());

revoke update on table public.buddy_requests from anon, authenticated;
grant update (status) on public.buddy_requests to authenticated;

-- -----------------------------------------------------------------------------
-- B7. Only admins resolve reports; guides can still read reports on their spots.
-- -----------------------------------------------------------------------------
drop policy if exists "reports_update_own_location" on public.reports;
revoke update on table public.reports from anon, authenticated;
grant update (status) on public.reports to authenticated;

-- -----------------------------------------------------------------------------
-- D1. notify_booking_status_change inserts 'booking_advance_paid', which the old
-- CHECK rejected, aborting the payment confirmation. Replace whatever type
-- check exists (its name may differ between installs).
-- -----------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.notifications'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.notifications add constraint notifications_type_check check (type in (
  'booking_requested', 'booking_accepted', 'booking_declined', 'booking_advance_paid',
  'booking_cancelled', 'new_message', 'buddy_request_received', 'buddy_request_accepted'
));

-- -----------------------------------------------------------------------------
-- D2. Admin payouts: admins can read the ledger and record payouts through an
-- audited function that cannot overpay a guide.
-- -----------------------------------------------------------------------------
drop policy if exists "guide_ledger_select_admin" on public.guide_ledger;
create policy "guide_ledger_select_admin" on public.guide_ledger
  for select using (public.is_admin());

create or replace function public.admin_record_payout(p_guide_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payout amount must be positive' using errcode = '22023';
  end if;

  -- Serialise payouts per guide so two admins cannot pay out the same balance.
  perform pg_advisory_xact_lock(hashtext('payout:' || p_guide_id::text));
  select coalesce(sum(amount), 0) into v_balance from public.guide_ledger where guide_id = p_guide_id;
  if p_amount > v_balance then
    raise exception 'Payout exceeds the guide''s balance of %', v_balance using errcode = '22023';
  end if;

  insert into public.guide_ledger (guide_id, type, amount) values (p_guide_id, 'payout', -p_amount);
  insert into public.admin_actions (admin_id, action, target_id, details)
  values (auth.uid(), 'record_payout', p_guide_id,
          jsonb_build_object('amount', p_amount, 'balance_before', v_balance));
end $$;

revoke all on function public.admin_record_payout(uuid, numeric) from public, anon;
grant execute on function public.admin_record_payout(uuid, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- B11. Payment capture in one transaction. Claiming the payment row with
-- "where status = 'created'" makes concurrent webhook deliveries safe:
-- only one of them gets the row back.
-- -----------------------------------------------------------------------------
create or replace function public.process_payment_captured(p_order_id text, p_payment_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_rows int;
  c_commission_rate constant numeric := 0.15;   -- keep in sync with payments-api
begin
  update public.payments
     set status = 'paid', razorpay_payment_id = p_payment_id
   where razorpay_order_id = p_order_id and status = 'created'
  returning * into v_payment;

  if not found then
    if exists (select 1 from public.payments where razorpay_order_id = p_order_id) then
      return 'already processed';
    end if;
    return 'no matching order';
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if not found then
    return 'booking missing';
  end if;

  if v_payment.stage = 'advance' then
    update public.bookings set status = 'confirmed'
     where id = v_booking.id and status = 'accepted';
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return 'booking not awaiting advance';
    end if;
  else
    update public.bookings set final_payment_mode = 'online' where id = v_booking.id;
    insert into public.guide_ledger (guide_id, booking_id, type, amount) values
      (v_booking.guide_id, v_booking.id, 'earning', v_booking.amount),
      (v_booking.guide_id, v_booking.id, 'commission', -round(v_booking.amount * c_commission_rate, 2));
  end if;

  return 'ok';
end $$;

revoke all on function public.process_payment_captured(text, text) from public, anon, authenticated;
grant execute on function public.process_payment_captured(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- B10. Server-side upload limits (the client checks too, but can be bypassed).
-- -----------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('avatars', 'location-media');

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'verification-docs';

notify pgrst, 'reload schema';
