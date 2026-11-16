-- =============================================================================
-- Guide availability calendar (IMPROVEMENT_PLAN item 4, F5).
--
-- Guides block the dates they cannot work. Signed-in users can read them so the
-- booking forms can hide them; only the guide adds or removes their own dates.
-- Booking requests and accepts on a blocked date are rejected by triggers.
--
-- Safe to re-run.
-- =============================================================================

create table if not exists public.guide_unavailable_dates (
  guide_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  note text check (note is null or char_length(note) <= 100),
  created_at timestamptz not null default now(),
  primary key (guide_id, date)
);

alter table public.guide_unavailable_dates enable row level security;

-- Column-level grants: clients write only (guide_id, date, note); no updates.
revoke all on table public.guide_unavailable_dates from anon, authenticated;
grant select on public.guide_unavailable_dates to authenticated;
grant insert (guide_id, date, note) on public.guide_unavailable_dates to authenticated;
grant delete on public.guide_unavailable_dates to authenticated;

drop policy if exists "guide_unavailable_dates_select" on public.guide_unavailable_dates;
create policy "guide_unavailable_dates_select" on public.guide_unavailable_dates
  for select to authenticated using (true);

drop policy if exists "guide_unavailable_dates_insert_own" on public.guide_unavailable_dates;
create policy "guide_unavailable_dates_insert_own" on public.guide_unavailable_dates
  for insert to authenticated with check (
    guide_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'guide')
    and not (select public.is_banned())
  );

drop policy if exists "guide_unavailable_dates_delete_own" on public.guide_unavailable_dates;
create policy "guide_unavailable_dates_delete_own" on public.guide_unavailable_dates
  for delete to authenticated using (
    guide_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'guide')
  );

-- Clients cannot block dates in the past (readable message instead of an RLS error).
create or replace function public.check_unavailable_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  new.created_at := now();
  if new.date < current_date then
    raise exception 'You cannot block a date in the past' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists check_unavailable_date on public.guide_unavailable_dates;
create trigger check_unavailable_date
  before insert on public.guide_unavailable_dates
  for each row execute function public.check_unavailable_date();

-- prepare_booking: body copied from 20261109000000_security_hardening.sql, plus
-- the blocked-date check at the end.
create or replace function public.prepare_booking()
returns trigger language plpgsql set search_path = public as $$
declare
  v_guide_id uuid;
  v_title text;
  v_status text;
  v_price numeric;
  v_rate numeric;
  v_guide_ok boolean;
  v_guide_name text;
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

  if exists (select 1 from public.guide_unavailable_dates
              where guide_id = new.guide_id and date = new.date) then
    select name into v_guide_name from public.profiles where id = new.guide_id;
    raise exception '% isn''t available on that date', coalesce(nullif(btrim(v_guide_name), ''), 'This guide')
      using errcode = '22023';
  end if;

  return new;
end $$;

-- Accepting a request on a date the guide has blocked is rejected. Kept separate
-- from enforce_booking_update so that function stays as it is.
create or replace function public.block_accept_on_unavailable_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.status = 'accepted' and old.status is distinct from 'accepted'
     and exists (select 1 from public.guide_unavailable_dates
                  where guide_id = new.guide_id and date = new.date) then
    raise exception 'You marked this date as unavailable. Remove it from your availability to accept this trip'
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists block_accept_on_unavailable_date on public.bookings;
create trigger block_accept_on_unavailable_date
  before update on public.bookings
  for each row execute function public.block_accept_on_unavailable_date();
