-- =============================================================================
-- Hotfix: the auth helpers used by RLS policies must run as their owner.
--
-- On production, is_admin() existed as a SECURITY INVOKER function (created by an
-- older migration), so it read admin_lookup with the caller's privileges. Once
-- 20261109000000_security_hardening revoked client access to admin_lookup, every
-- policy that calls is_admin() failed with "permission denied for table
-- admin_lookup", breaking sign-in and most queries. Recreate both helpers exactly
-- as the baseline defines them: SECURITY DEFINER with a pinned search_path.
-- Safe to re-run.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_lookup where user_id = auth.uid());
$$;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false);
$$;

-- Policies evaluate these for anonymous visitors too (e.g. the admin read policy
-- on locations), so both client roles need EXECUTE.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_banned() to anon, authenticated;
