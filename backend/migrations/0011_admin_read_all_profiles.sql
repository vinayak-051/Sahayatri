-- Admin can read ALL profiles (travelers + guides) for the admin dashboard.
-- Without this, the traveler count and traveler detail list show only the
-- admin's own profile because no existing policy covers cross-role reads.

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );
