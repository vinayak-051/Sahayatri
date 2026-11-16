-- =============================================================================
-- Booking lifecycle fixes from the production test round (docs/IMPROVEMENT_PLAN.md).
--
-- F1: a request whose trip date has passed has expired; a guide can no longer
--     accept it (declining stays possible, to clear it).
-- F2: accepting a request is not a confirmation: the traveller still has to pay
--     the advance. The notification now says "Booking accepted".
-- Safe to re-run.
-- =============================================================================

create or replace function public.reject_expired_acceptance()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and old.status = 'pending' and new.status = 'accepted'
     and old.date < current_date then
    raise exception 'This request has expired: the trip date has passed' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists reject_expired_acceptance on public.bookings;
create trigger reject_expired_acceptance
  before update of status on public.bookings
  for each row execute function public.reject_expired_acceptance();

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
      case when new.status = 'accepted' then 'Booking accepted' else 'Booking declined' end,
      coalesce(guide_name, 'Your guide') ||
        case when new.status = 'accepted'
             then ' accepted your trip to ' || new.destination || '. Pay the advance to confirm it.'
             else ' declined your trip to ' || new.destination end,
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
