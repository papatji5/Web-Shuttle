-- Add payment fields to the rides table for payment method and payment status tracking

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM ('CASH', 'CARD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE public.payment_status AS ENUM ('PENDING', 'PAID', 'UNPAID', 'FAILED');
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

ALTER TABLE IF EXISTS public.rides
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'UNPAID';
