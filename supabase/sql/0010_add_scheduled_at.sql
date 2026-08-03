-- Add scheduled pickup support for passenger rides

ALTER TABLE IF EXISTS public.rides
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
