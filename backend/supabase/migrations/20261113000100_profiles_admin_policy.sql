-- =============================================================================
-- Hotfix: production's profiles_select_admin policy queried admin_lookup inline
-- (exists (select 1 from admin_lookup ...)), from an older migration, instead of
-- calling public.is_admin() as the baseline does. Policy subqueries run with the
-- caller's privileges, so after 20261109000000_security_hardening revoked client
-- access to admin_lookup, every query touching profiles failed with
-- "permission denied for table admin_lookup", which broke sign-in.
--
-- Recreate the policy through is_admin() (SECURITY DEFINER), wrapped so it runs
-- once per query. Safe to re-run.
-- =============================================================================

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using ((select public.is_admin()));
