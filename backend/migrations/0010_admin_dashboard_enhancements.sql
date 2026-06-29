-- ============================================================
-- Admin can read ALL bookings (not just ones they're part of)
-- ============================================================
DROP POLICY IF EXISTS "bookings_select_admin" ON public.bookings;
CREATE POLICY "bookings_select_admin" ON public.bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admin can read ALL buddy_requests
DROP POLICY IF EXISTS "buddy_requests_select_admin" ON public.buddy_requests;
CREATE POLICY "buddy_requests_select_admin" ON public.buddy_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================
-- Unverified guides cannot have bookings accepted
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_guide_verified_on_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = NEW.guide_id AND is_verified = true
    ) THEN
      RAISE EXCEPTION 'Guide is not verified and cannot accept bookings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_guide_verified_check ON public.bookings;
CREATE TRIGGER booking_guide_verified_check
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_guide_verified_on_booking();
