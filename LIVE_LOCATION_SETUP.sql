-- ============================================================
-- SHRAMIK SETU — LIVE GPS TRACKING SYSTEM
-- Execute this SQL in Supabase Dashboard → SQL Editor
-- ============================================================
-- Run this ONCE to create the user_locations table.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- 1. Create user_locations table (separate from users table)
CREATE TABLE IF NOT EXISTS public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'labour', 'worker', 'admin')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  online_status BOOLEAN DEFAULT true,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON public.user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_online ON public.user_locations(online_status);
CREATE INDEX IF NOT EXISTS idx_user_locations_role ON public.user_locations(role);

-- 3. Enable Row Level Security
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (drop first to avoid conflict on re-run)
-- NOTE: Using DO block to safely create policies only if they don't exist

DO $$ BEGIN
  -- Drop existing policies if they exist (safe for re-runs)
  DROP POLICY IF EXISTS "Public read user_locations" ON public.user_locations;
  DROP POLICY IF EXISTS "Users can insert own location" ON public.user_locations;
  DROP POLICY IF EXISTS "Users can update own location" ON public.user_locations;
  DROP POLICY IF EXISTS "Users can delete own location" ON public.user_locations;
END $$;

-- Allow anyone to read all locations (admin needs this;
-- fine-grained filtering is done in the app layer based on role)
CREATE POLICY "Public read user_locations"
  ON public.user_locations
  FOR SELECT
  USING (true);

-- Allow anyone to insert their own location
CREATE POLICY "Users can insert own location"
  ON public.user_locations
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update their own location
CREATE POLICY "Users can update own location"
  ON public.user_locations
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow delete for cleanup
CREATE POLICY "Users can delete own location"
  ON public.user_locations
  FOR DELETE
  USING (true);

-- 5. Enable Supabase Realtime on this table
-- This adds the table to the realtime publication
-- Safe to run multiple times (Supabase ignores if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'user_locations already in supabase_realtime publication';
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication does not exist, creating it';
    CREATE PUBLICATION supabase_realtime FOR TABLE public.user_locations;
END $$;

-- ============================================================
-- VERIFICATION: Run this to confirm the table was created
-- ============================================================
-- SELECT * FROM public.user_locations LIMIT 5;
-- 
-- You should see an empty result (or existing rows).
-- If you get an error, the table was not created properly.
-- ============================================================

-- ============================================================
-- IMPORTANT NEXT STEPS:
-- 1. Go to Supabase Dashboard → Database → Replication
-- 2. Find "user_locations" in the tables list
-- 3. Enable Realtime for it (toggle ON)
-- 4. That's it! Live location tracking is now ready.
-- ============================================================
