-- =============================================================================
-- Guide stats and admin analytics computed in the database:
--   * bookings.responded_at: when the guide first answered a request
--     (accepted or declined). Set only by a trigger. Older rows stay null and
--     are left out of response-time figures.
--   * guide_public_stats(guide_id): trust signals shown on a guide's page.
--     Aggregates only; nothing private.
--   * guide_my_stats(): the signed-in guide's own dashboard numbers, from
--     completed trips and the guide ledger.
--   * admin_booking_timeseries(months): per-day and per-month booking counts
--     and value for the admin Analytics tab, so the browser no longer downloads
--     booking rows.
--
-- Safe to re-run.
-- =============================================================================

alter table public.bookings add column if not exists responded_at timestamptz;

-- Clients have column-level UPDATE only on (status, feedback), so they cannot
-- write responded_at directly. A table-level INSERT grant would let them send
-- it on insert, so the trigger also clears it there.
create or replace function public.set_booking_responded_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.responded_at := null;
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    -- enforce_booking_update allows this move only for the booking's guide.
    new.responded_at := coalesce(old.responded_at, now());
  elsif current_user in ('anon', 'authenticated') then
    new.responded_at := old.responded_at;
  end if;
  return new;
end $$;

drop trigger if exists set_booking_responded_at on public.bookings;
create trigger set_booking_responded_at
  before insert or update on public.bookings
  for each row execute function public.set_booking_responded_at();

-- The admin time series filters on created_at.
create index if not exists bookings_created_at_idx on public.bookings (created_at);

-- -----------------------------------------------------------------------------
-- Public trust signals for a verified guide. Returns null for anyone who is not
-- a verified guide.
--   completed_trips        completed bookings
--   travellers_served      distinct travellers with a completed trip
--   response_rate          answered / (answered + pending requests older than
--                          48 hours), 0..1; null when there are none. Requests
--                          the traveller cancelled before an answer are left out.
--   median_response_hours  median time from request to first answer; only rows
--                          with responded_at count. Null when there are none.
--   member_since           when the guide joined
--   reviews_count, avg_rating
-- -----------------------------------------------------------------------------
create or replace function public.guide_public_stats(p_guide_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_member_since timestamptz;
  v_b record;
  v_r record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see guide stats' using errcode = '42501';
  end if;

  select p.created_at into v_member_since
    from public.profiles p
   where p.id = p_guide_id and p.role = 'guide' and p.is_verified;
  if not found then
    return null;
  end if;

  select count(*) filter (where status = 'completed')                         as completed_trips,
         count(distinct traveler_id) filter (where status = 'completed')      as travellers_served,
         count(*) filter (where responded_at is not null
                             or status in ('accepted', 'confirmed', 'completed', 'declined')) as answered,
         count(*) filter (where status = 'pending'
                             and created_at < now() - interval '48 hours')    as unanswered,
         percentile_cont(0.5) within group (
           order by greatest(extract(epoch from responded_at - created_at), 0)
         ) filter (where responded_at is not null and created_at is not null) as median_seconds
    into v_b
    from public.bookings
   where guide_id = p_guide_id;

  select count(*) as reviews_count, round(avg(rating)::numeric, 2) as avg_rating
    into v_r
    from public.reviews
   where guide_id = p_guide_id;

  return json_build_object(
    'completed_trips',       v_b.completed_trips,
    'travellers_served',     v_b.travellers_served,
    'response_rate',         case when v_b.answered + v_b.unanswered = 0 then null
                                  else round(v_b.answered::numeric / (v_b.answered + v_b.unanswered), 3) end,
    'median_response_hours', case when v_b.median_seconds is null then null
                                  else round((v_b.median_seconds / 3600)::numeric, 1) end,
    'member_since',          v_member_since,
    'reviews_count',         v_r.reviews_count,
    'avg_rating',            v_r.avg_rating
  );
end $$;

revoke all on function public.guide_public_stats(uuid) from public, anon;
grant execute on function public.guide_public_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- The signed-in guide's own numbers. Money in rupees, from guide_ledger:
--   lifetime_earnings  earnings minus commission (commission is stored negative)
--   ledger_balance     everything in the ledger, payouts included: what the
--                      platform still owes the guide
-- pending_requests counts only requests whose trip date has not passed.
-- -----------------------------------------------------------------------------
create or replace function public.guide_my_stats()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b record;
  v_l record;
  v_r record;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and role = 'guide') then
    raise exception 'Only guides have guide stats' using errcode = '42501';
  end if;

  select count(*) filter (where status = 'completed')                        as completed_trips,
         count(distinct traveler_id) filter (where status = 'completed')     as travellers_served,
         count(*) filter (where status = 'pending' and date >= current_date) as pending_requests,
         count(*) filter (where status in ('accepted', 'confirmed') and date >= current_date) as upcoming_trips,
         count(*) filter (where status = 'pending')                          as pending,
         count(*) filter (where status = 'accepted')                         as accepted,
         count(*) filter (where status = 'confirmed')                        as confirmed,
         count(*) filter (where status = 'completed')                        as completed,
         count(*) filter (where status = 'declined')                         as declined,
         count(*) filter (where status = 'cancelled')                        as cancelled
    into v_b
    from public.bookings
   where guide_id = v_uid;

  select coalesce(sum(amount), 0)                                                as balance,
         coalesce(sum(amount) filter (where type in ('earning', 'commission')), 0) as lifetime
    into v_l
    from public.guide_ledger
   where guide_id = v_uid;

  select count(*) as reviews_count, round(avg(rating)::numeric, 2) as avg_rating
    into v_r
    from public.reviews
   where guide_id = v_uid;

  return json_build_object(
    'completed_trips',   v_b.completed_trips,
    'travellers_served', v_b.travellers_served,
    'pending_requests',  v_b.pending_requests,
    'upcoming_trips',    v_b.upcoming_trips,
    'bookings_by_status', json_build_object(
      'pending',   v_b.pending,
      'accepted',  v_b.accepted,
      'confirmed', v_b.confirmed,
      'completed', v_b.completed,
      'declined',  v_b.declined,
      'cancelled', v_b.cancelled
    ),
    'ledger_balance',    v_l.balance,
    'lifetime_earnings', v_l.lifetime,
    'reviews_count',     v_r.reviews_count,
    'avg_rating',        v_r.avg_rating
  );
end $$;

revoke all on function public.guide_my_stats() from public, anon;
grant execute on function public.guide_my_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- Booking counts by status and booking value (sum of amount, every status) per
-- day and per month, by request date in India time. Covers the current month
-- and the p_months - 1 before it (1..24); days and months with no bookings are
-- included with zeros.
-- -----------------------------------------------------------------------------
create or replace function public.admin_booking_timeseries(p_months int default 6)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_months int := least(greatest(coalesce(p_months, 6), 1), 24);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date;
  v_daily json;
  v_monthly json;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_start := (date_trunc('month', v_today) - make_interval(months => v_months - 1))::date;

  with b as (
    select (created_at at time zone 'Asia/Kolkata')::date as day, status, amount
      from public.bookings
     where created_at >= (v_start::timestamp at time zone 'Asia/Kolkata')
  ),
  per_day as (
    select d.day,
           count(b.day)                                    as total,
           count(*) filter (where b.status = 'pending')    as pending,
           count(*) filter (where b.status = 'accepted')   as accepted,
           count(*) filter (where b.status = 'confirmed')  as confirmed,
           count(*) filter (where b.status = 'completed')  as completed,
           count(*) filter (where b.status = 'declined')   as declined,
           count(*) filter (where b.status = 'cancelled')  as cancelled,
           coalesce(sum(b.amount), 0)                      as value
      from (select g::date as day from generate_series(v_start, v_today, interval '1 day') g) d
      left join b on b.day = d.day
     group by d.day
  )
  select json_agg(json_build_object(
           'day', to_char(day, 'YYYY-MM-DD'), 'total', total, 'pending', pending,
           'accepted', accepted, 'confirmed', confirmed, 'completed', completed,
           'declined', declined, 'cancelled', cancelled, 'value', value) order by day),
         (select json_agg(json_build_object(
                   'month', to_char(month, 'YYYY-MM'), 'total', total, 'pending', pending,
                   'accepted', accepted, 'confirmed', confirmed, 'completed', completed,
                   'declined', declined, 'cancelled', cancelled, 'value', value) order by month)
            from (select date_trunc('month', day)::date as month,
                         sum(total) as total, sum(pending) as pending, sum(accepted) as accepted,
                         sum(confirmed) as confirmed, sum(completed) as completed,
                         sum(declined) as declined, sum(cancelled) as cancelled, sum(value) as value
                    from per_day
                   group by 1) m)
    into v_daily, v_monthly
    from per_day;

  return json_build_object(
    'timezone', 'Asia/Kolkata',
    'from',     to_char(v_start, 'YYYY-MM-DD'),
    'to',       to_char(v_today, 'YYYY-MM-DD'),
    'daily',    coalesce(v_daily, '[]'::json),
    'monthly',  coalesce(v_monthly, '[]'::json)
  );
end $$;

revoke all on function public.admin_booking_timeseries(int) from public, anon;
grant execute on function public.admin_booking_timeseries(int) to authenticated;

notify pgrst, 'reload schema';
