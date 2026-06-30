-- Fix infinite recursion in profiles RLS policy.
-- The "profiles_select_admin" policy queries profiles inside a profiles policy,
-- causing PostgreSQL error 42P17. Replace it with a SECURITY DEFINER function
-- that bypasses RLS when checking admin status.

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (public.is_current_user_admin());
