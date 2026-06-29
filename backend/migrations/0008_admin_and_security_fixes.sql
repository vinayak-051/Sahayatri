-- ============================================================
-- Migration 0008: Admin role, security fixes, booking/review RLS
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add is_admin flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Fix profiles RLS: require authentication to read any profile
--    (removes anonymous read-all; all app routes require login anyway)
DO $$
BEGIN
  -- Drop the overly-permissive open policy if it exists
  DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
  DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
  DROP POLICY IF EXISTS "profiles_select_guides" ON profiles;
  DROP POLICY IF EXISTS "profiles_select_booking_parties" ON profiles;
  DROP POLICY IF EXISTS "profiles_select_message_parties" ON profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Authenticated users can read their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Authenticated users can read guide profiles (for discovery)
CREATE POLICY "profiles_select_guides" ON profiles
  FOR SELECT USING (role = 'guide' AND auth.uid() IS NOT NULL);

-- Authenticated users can read profiles of people they share a booking with
CREATE POLICY "profiles_select_booking_parties" ON profiles
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM bookings
      WHERE (bookings.traveler_id = auth.uid() AND bookings.guide_id = profiles.id)
         OR (bookings.guide_id = auth.uid() AND bookings.traveler_id = profiles.id)
    )
  );

-- Authenticated users can read profiles of people they share a message thread with
CREATE POLICY "profiles_select_message_parties" ON profiles
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM messages
      WHERE (messages.sender_id = auth.uid() AND messages.receiver_id = profiles.id)
         OR (messages.receiver_id = auth.uid() AND messages.sender_id = profiles.id)
    )
  );

-- 3. Add SECURITY DEFINER function so admin can verify/unverify guides
--    without needing a broad UPDATE policy
CREATE OR REPLACE FUNCTION admin_verify_guide(p_guide_id uuid, p_verified boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: admin only';
  END IF;

  UPDATE profiles
  SET is_verified = p_verified
  WHERE id = p_guide_id AND role = 'guide';
END;
$$;

-- Grant execute to authenticated users (RLS inside the function handles access)
GRANT EXECUTE ON FUNCTION admin_verify_guide(uuid, boolean) TO authenticated;

-- 4. Booking amount must be positive
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_amount_positive') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_amount_positive CHECK (amount >= 0);
  END IF;
END $$;

-- 5. Reviews: only allow review if there is a completed booking with that guide
--    Drop whatever insert policy currently exists and replace with a stricter one.
DO $$
BEGIN
  DROP POLICY IF EXISTS "reviews_insert" ON reviews;
  DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON reviews;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "reviews_insert_completed_booking" ON reviews
  FOR INSERT WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.traveler_id = auth.uid()
        AND bookings.guide_id   = reviews.guide_id
        AND bookings.status     = 'completed'
    )
  );

-- ============================================================
-- After running this migration:
-- 1. Set yourself as admin in Supabase Table Editor:
--    UPDATE profiles SET is_admin = true WHERE email = 'your@email.com';
-- 2. Navigate to /admin in the app to access the Admin Dashboard.
-- ============================================================
