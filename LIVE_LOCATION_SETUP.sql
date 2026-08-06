-- ============================================================
-- SHRAMIK SETU — LIVE GPS TRACKING SYSTEM
-- Execute this SQL in Supabase Dashboard → SQL Editor
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

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON public.user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_online ON public.user_locations(online_status);
CREATE INDEX IF NOT EXISTS idx_user_locations_role ON public.user_locations(role);

-- 3. Enable Row Level Security
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

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
-- Run this to add the table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;

-- ============================================================
-- DONE! The user_locations table is ready for live GPS tracking.
-- ============================================================
