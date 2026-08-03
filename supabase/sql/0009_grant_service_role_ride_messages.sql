-- Grant the Supabase `service_role` explicit privileges to access ride messages
-- Run this migration in your Supabase SQL editor or via psql to fix permission errors

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_messages TO service_role;

-- Also ensure read access to referenced tables used by policies/queries
GRANT SELECT ON public.rides TO service_role;
GRANT SELECT ON public.profiles TO service_role;

-- If you use sequences elsewhere, you may want to grant usage as needed
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
