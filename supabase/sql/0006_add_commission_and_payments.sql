-- Add payment tracking and commission split fields for admin finance tracking

ALTER TABLE IF EXISTS public.rides
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer,
  ADD COLUMN IF NOT EXISTS driver_payout_cents integer;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null,
  provider_reference text,
  amount_cents integer not null,
  status text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Allow the Supabase service role to read/write finance data even when RLS is enabled.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rides' AND policyname = 'allow_service_select_on_rides'
  ) THEN
    CREATE POLICY allow_service_select_on_rides
      ON public.rides
      FOR SELECT
      TO service_role
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rides' AND policyname = 'allow_service_all_on_rides'
  ) THEN
    CREATE POLICY allow_service_all_on_rides
      ON public.rides
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payments')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'allow_service_select_on_payments'
     ) THEN
    CREATE POLICY allow_service_select_on_payments
      ON public.payments
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;
