-- Ride messages for production-safe chat on Vercel
create table if not exists public.ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role public.app_role not null,
  sender_name text,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.ride_messages enable row level security;

drop policy if exists ride_messages_select_participants on public.ride_messages;
create policy ride_messages_select_participants
on public.ride_messages
for select
using (
  exists (
    select 1
    from public.rides r
    where r.id = ride_messages.ride_id
      and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  )
);

drop policy if exists ride_messages_insert_participants on public.ride_messages;
create policy ride_messages_insert_participants
on public.ride_messages
for insert
with check (
  exists (
    select 1
    from public.rides r
    where r.id = ride_messages.ride_id
      and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  )
);
