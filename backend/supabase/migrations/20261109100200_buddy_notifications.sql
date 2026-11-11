-- =============================================================================
-- Travel Buddy notifications.
--
-- A trip owner hears about every new join request, and a requester hears when
-- their request is accepted. Declined requests stay quiet; the requester sees
-- "Declined" on the trip instead.
--
-- Clients have no INSERT on notifications, so both functions are SECURITY
-- DEFINER, like the other notify_* functions in the baseline migration.
--
-- Safe to re-run.
-- =============================================================================

create or replace function public.notify_buddy_request_received()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid;
  v_destination text;
begin
  select user_id, destination into v_owner_id, v_destination
    from public.buddy_trips where id = new.trip_id;

  -- Nobody to tell: the trip is gone, or the row is the owner's own (clients
  -- cannot create that, but the service role can).
  if v_owner_id is null or v_owner_id = new.traveler_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_owner_id,
    'buddy_request_received',
    'New travel buddy request',
    coalesce((select name from public.profiles where id = new.traveler_id), 'A traveller')
      || ' wants to join your trip to ' || coalesce(v_destination, 'your destination'),
    jsonb_build_object('trip_id', new.trip_id, 'request_id', new.id, 'requester_id', new.traveler_id)
  );
  return new;
end $$;

drop trigger if exists on_buddy_request_received on public.buddy_requests;
create trigger on_buddy_request_received
  after insert on public.buddy_requests
  for each row execute function public.notify_buddy_request_received();

create or replace function public.notify_buddy_request_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid;
  v_destination text;
begin
  -- Only when the status actually becomes 'accepted' (not on a repeated update).
  if new.status is distinct from 'accepted' or old.status is not distinct from new.status then
    return new;
  end if;

  select user_id, destination into v_owner_id, v_destination
    from public.buddy_trips where id = new.trip_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.traveler_id,
    'buddy_request_accepted',
    'Travel buddy request accepted',
    coalesce((select name from public.profiles where id = v_owner_id), 'The trip organiser')
      || ' accepted your request to join the trip to ' || coalesce(v_destination, 'their destination'),
    jsonb_build_object('trip_id', new.trip_id)
  );
  return new;
end $$;

drop trigger if exists on_buddy_request_accepted on public.buddy_requests;
create trigger on_buddy_request_accepted
  after update of status on public.buddy_requests
  for each row execute function public.notify_buddy_request_accepted();

-- Trigger functions are never called directly.
revoke all on function public.notify_buddy_request_received() from public, anon, authenticated;
revoke all on function public.notify_buddy_request_accepted() from public, anon, authenticated;
