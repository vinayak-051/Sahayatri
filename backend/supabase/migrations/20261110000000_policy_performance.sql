-- =============================================================================
-- RLS performance: evaluate auth.uid(), is_admin() and is_banned() once per
-- query instead of once per row.
--
-- A bare function call in a policy is re-run for every row the query touches;
-- wrapped in a scalar subquery, Postgres runs it once (an InitPlan) and reuses the
-- result. This is Supabase's recommended form. is_admin() in particular queries
-- admin_lookup, and on large tables it dominated query time (for example the
-- search_locations function over thousands of spots).
--
-- Rewrites every policy in the public and storage schemas, so it also covers
-- policies created by earlier migrations. Behaviour is unchanged. Safe to re-run:
-- already-wrapped calls are left alone. Write new policies in the wrapped form,
-- e.g.  using ((select auth.uid()) = user_id).
-- =============================================================================

create or replace function pg_temp.wrap_auth_calls(expr text) returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(expr,
               '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid() AS uid)', 'g'),
             '(?<!SELECT )(?<!\.)(public\.)?is_admin\(\)', '( SELECT public.is_admin() AS is_admin)', 'g'),
           '(?<!SELECT )(?<!\.)(public\.)?is_banned\(\)', '( SELECT public.is_banned() AS is_banned)', 'g')
$$;

do $$
declare
  p record;
  new_qual text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
  loop
    new_qual := pg_temp.wrap_auth_calls(p.qual);
    new_check := pg_temp.wrap_auth_calls(p.with_check);
    if new_qual is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, new_qual);
    end if;
    if new_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, new_check);
    end if;
  end loop;
end $$;
