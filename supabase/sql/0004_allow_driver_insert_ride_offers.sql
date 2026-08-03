-- Allow authenticated drivers to INSERT ride_offers for themselves
-- so a driver who accepts a ride can create the corresponding offer row.

drop policy if exists ride_offers_insert_driver on public.ride_offers;

create policy ride_offers_insert_driver
  on public.ride_offers
  for insert
  with check (driver_id = auth.uid());

-- This complements the existing admin-only insert policy.
