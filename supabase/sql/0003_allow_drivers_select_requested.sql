-- Allow authenticated drivers to SELECT rides that are in REQUESTED status
-- so they can view and accept available ride requests.

-- Drop existing policy (safe) then create the policy
drop policy if exists rides_select_requested_drivers on public.rides;

create policy rides_select_requested_drivers
  on public.rides
  for select
  using (
    status = 'REQUESTED'
    and exists (select 1 from public.drivers d where d.id = auth.uid())
  );

-- Note: Policies for the same command are combined with OR, so this complements
-- the existing 'rides_select_parties' and 'rides_select_offered_driver' policies.
