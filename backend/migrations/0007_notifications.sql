-- Real notification feed (replaces Notifications.tsx re-deriving from `bookings`)
-- plus storage for Web Push subscriptions so events can reach a closed browser.

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

create index notifications_user_id_idx on public.notifications(user_id);

alter table public.notifications enable row level security;

-- No insert policy: rows are only ever written by the security definer trigger
-- functions below (same bypass-RLS pattern as sync_guide_rating() in 0001_init.sql).
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- =========================================================================
-- PUSH SUBSCRIPTIONS (Web Push — lets an event reach a closed browser)
-- =========================================================================
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (user_id = auth.uid());
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- =========================================================================
-- TRIGGERS — write a notification row whenever something a user cares
-- about happens. A Database Webhook (configured separately in the Supabase
-- dashboard, see backend/migrations/README for this batch) fires the
-- send-push edge function on each insert to also deliver a Web Push.
-- =========================================================================
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
  if new.status = old.status then
    return new;
  end if;

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

-- =========================================================================
-- REALTIME (live bell badge / list while the app is open)
-- =========================================================================
alter publication supabase_realtime add table public.notifications;
