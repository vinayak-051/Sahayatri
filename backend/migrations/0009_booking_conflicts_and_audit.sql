-- Ensure is_admin column exists (added in 0008, guard for fresh runs)
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Prevent double-booking: one accepted booking per guide per date
create unique index if not exists bookings_guide_date_accepted on public.bookings(guide_id, date) where status = 'accepted';

-- Admin audit trail
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_actions enable row level security;

drop policy if exists "admin_actions_select_admin" on public.admin_actions;
create policy "admin_actions_select_admin" on public.admin_actions
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Update admin_verify_guide to log every action
create or replace function public.admin_verify_guide(p_guide_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
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
