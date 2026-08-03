-- Allow drivers to claim unassigned rides (update driver_id when it's NULL)
-- Drops any older restrictive policy and creates a safe claim policy.

drop policy if exists rides_update_offered_driver_claim on public.rides;

create policy rides_update_driver_claim
  on public.rides
  for update
  using (
    driver_id is null
    and exists (select 1 from public.drivers d where d.id = auth.uid())
  )
  with check (driver_id = auth.uid());

-- Notes:
-- 1) Run this in your Supabase SQL editor (or via psql using the service role) to apply.
-- 2) Adjust the `public.drivers` check if your drivers table or auth mapping differs.
