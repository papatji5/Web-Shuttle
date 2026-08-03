-- Ride-hailing MVP schema (Johannesburg/Pretoria)
-- Paste this into Supabase -> SQL Editor -> New query

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- Enums
do $$ begin
  create type public.app_role as enum ('PASSENGER','DRIVER','ADMIN');
exception when duplicate_object then null;
end $$$;

do $$ begin
  create type public.driver_approval_status as enum ('PENDING','APPROVED','REJECTED','SUSPENDED');
exception when duplicate_object then null;
end $$$;

do $$ begin
  create type public.ride_status as enum (
    'REQUESTED','DISPATCHING','OFFERED','ACCEPTED','ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED'
  );
exception when duplicate_object then null;
end $$$;

do $$ begin
  create type public.offer_status as enum ('SENT','ACCEPTED','REJECTED','EXPIRED');
exception when duplicate_object then null;
end $$$;

-- Profiles (one row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,\n  phone text,
  role public.app_role not null default 'PASSENGER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$$
begin
  new.updated_at = now();
  return new;
end;
$$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Drivers
create table if not exists public.drivers (
  id uuid primary key references public.profiles(id) on delete cascade,
  approval_status public.driver_approval_status not null default 'PENDING',
  balance_cents integer not null default 0,
  rating_avg numeric(3,2) not null default 5.00,
  rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists drivers_set_updated_at on public.drivers;
create trigger drivers_set_updated_at
before update on public.drivers
for each row execute function public.set_updated_at();

-- Vehicles
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  make text not null,
  model text not null,
  color text,
  plate_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

-- Driver location (store latest)
create table if not exists public.driver_locations (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  location geography(point,4326) not null,
  heading integer,
  speed_mps numeric,
  recorded_at timestamptz not null default now()
);


-- Secure helper: save the current driver's live location without exposing table writes.
drop function if exists public.save_driver_location(double precision, double precision);
create or replace function public.save_driver_location(
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception ''not authenticated'';
  end if;

  insert into public.driver_locations (driver_id, location, recorded_at)
  values (
    auth.uid(),
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    now()
  )
  on conflict (driver_id) do update
    set location = excluded.location,
        recorded_at = excluded.recorded_at;
end;
$$;

grant execute on function public.save_driver_location(double precision, double precision) to authenticated;
-- Pricing rules
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  city text not null default 'GAUTENG',
  base_fare_cents integer not null,
  per_km_cents integer not null,
  per_min_cents integer not null,
  min_fare_cents integer not null,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Rides
-- NOTE: pickup/dropoff locations are nullable for text-only MVP.
create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete set null,
  status public.ride_status not null default 'REQUESTED',

  pickup_location geography(point,4326),
  pickup_address text,
  dropoff_location geography(point,4326),
  dropoff_address text,
  scheduled_at timestamptz,

  estimated_distance_km numeric,
  estimated_duration_min numeric,
  estimated_fare_cents integer,

  final_distance_km numeric,
  final_duration_min numeric,
  final_fare_cents integer,

  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
);

-- Migration safety: if an older DB had these as NOT NULL, make them nullable
-- (text-only MVP inserts NULL for pickup/dropoff locations).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rides'
      and column_name = 'pickup_location'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.rides alter column pickup_location drop not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rides'
      and column_name = 'dropoff_location'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.rides alter column dropoff_location drop not null';
  end if;
end $$$;

-- Ride offers
create table if not exists public.ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  status public.offer_status not null default 'SENT',
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null
);

-- Ratings
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Support tickets
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides(id) on delete set null,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  message text not null,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.driver_locations enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.rides enable row level security;
alter table public.ride_offers enable row level security;
alter table public.ratings enable row level security;
alter table public.support_tickets enable row level security;

-- Helper: is_admin()
-- SECURITY DEFINER avoids RLS recursion when used inside policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN'
  );
$$$;

-- Helper: has_ride_offer(ride_id, driver_id [, status])
-- SECURITY DEFINER prevents RLS recursion when rides policies need to check ride_offers.
create or replace function public.has_ride_offer(
  p_ride_id uuid,
  p_driver_id uuid,
  p_status public.offer_status default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as ;
  select exists (
    select 1
    from public.ride_offers o
    where o.ride_id = p_ride_id
      and o.driver_id = p_driver_id
      and (p_status is null or o.status = p_status)
  );
;;
-- Policies: profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

-- Admin can update any profile (e.g., set role)
drop policy if exists "profiles_update_admin_any" on public.profiles;
create policy "profiles_update_admin_any" on public.profiles
for update using (public.is_admin()) with check (public.is_admin());

-- Policies: drivers
drop policy if exists "drivers_select_own_or_admin" on public.drivers;
create policy "drivers_select_own_or_admin" on public.drivers
for select using (auth.uid() = id or public.is_admin());

drop policy if exists "drivers_insert_self" on public.drivers;
create policy "drivers_insert_self" on public.drivers
for insert with check (auth.uid() = id);

-- Admin can create driver rows for other users
drop policy if exists "drivers_insert_admin_any" on public.drivers;
create policy "drivers_insert_admin_any" on public.drivers
for insert with check (public.is_admin());

drop policy if exists "drivers_update_self_or_admin" on public.drivers;
create policy "drivers_update_self_or_admin" on public.drivers
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

-- Admin can update any driver row
drop policy if exists "drivers_update_admin_any" on public.drivers;
create policy "drivers_update_admin_any" on public.drivers
for update using (public.is_admin())
with check (public.is_admin());

-- Policies: vehicles
drop policy if exists "vehicles_select_own_or_admin" on public.vehicles;
create policy "vehicles_select_own_or_admin" on public.vehicles
for select using (driver_id = auth.uid() or public.is_admin());

drop policy if exists "vehicles_write_own" on public.vehicles;
create policy "vehicles_write_own" on public.vehicles
for insert with check (driver_id = auth.uid());

drop policy if exists "vehicles_update_own" on public.vehicles;
create policy "vehicles_update_own" on public.vehicles
for update using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- Policies: driver_locations
drop policy if exists "driver_locations_select_admin" on public.driver_locations;
create policy "driver_locations_select_admin" on public.driver_locations
for select using (public.is_admin());

drop policy if exists "driver_locations_select_own" on public.driver_locations;
create policy "driver_locations_select_own" on public.driver_locations
for select using (driver_id = auth.uid());

drop policy if exists "driver_locations_upsert_own" on public.driver_locations;
create policy "driver_locations_upsert_own" on public.driver_locations
for insert with check (driver_id = auth.uid());

drop policy if exists "driver_locations_update_own" on public.driver_locations;
create policy "driver_locations_update_own" on public.driver_locations
for update using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- Policies: pricing_rules (admin-only)
drop policy if exists "pricing_admin_only" on public.pricing_rules;
create policy "pricing_admin_only" on public.pricing_rules
for all using (public.is_admin()) with check (public.is_admin());

-- Policies: rides
drop policy if exists "rides_select_parties" on public.rides;
create policy "rides_select_parties" on public.rides
for select using (
  passenger_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin()
);

-- Offered drivers can view rides they were offered
drop policy if exists "rides_select_offered_driver" on public.rides;
create policy "rides_select_offered_driver" on public.rides
for select using (public.has_ride_offer(id, auth.uid()));

drop policy if exists "rides_insert_passenger" on public.rides;
create policy "rides_insert_passenger" on public.rides
for insert with check (passenger_id = auth.uid());

drop policy if exists "rides_update_parties" on public.rides;
create policy "rides_update_parties" on public.rides
for update using (
  passenger_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin()
)
with check (
  passenger_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin()
);

-- Offered driver can claim a ride by setting driver_id to themselves
drop policy if exists "rides_update_offered_driver_claim" on public.rides;
create policy "rides_update_offered_driver_claim" on public.rides
for update using (
  driver_id is null
  and public.has_ride_offer(id, auth.uid(), 'SENT')
)
with check (
  driver_id = auth.uid()
);
-- Policies: ride_offers
-- NOTE: Do NOT reference public.rides from this policy.
-- rides has a policy that references ride_offers (offered-driver visibility), which would recurse.
drop policy if exists "ride_offers_select_parties" on public.ride_offers;
create policy "ride_offers_select_parties" on public.ride_offers
for select using (
  driver_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "ride_offers_insert_admin" on public.ride_offers;
create policy "ride_offers_insert_admin" on public.ride_offers
for insert with check (public.is_admin());

drop policy if exists "ride_offers_update_driver_or_admin" on public.ride_offers;
create policy "ride_offers_update_driver_or_admin" on public.ride_offers
for update using (driver_id = auth.uid() or public.is_admin())
with check (driver_id = auth.uid() or public.is_admin());

-- Policies: ratings
drop policy if exists "ratings_select_parties" on public.ratings;
create policy "ratings_select_parties" on public.ratings
for select using (
  from_user_id = auth.uid()
  or to_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "ratings_insert_self" on public.ratings;
create policy "ratings_insert_self" on public.ratings
for insert with check (from_user_id = auth.uid());

-- Policies: support_tickets
drop policy if exists "tickets_select_own_or_admin" on public.support_tickets;
create policy "tickets_select_own_or_admin" on public.support_tickets
for select using (reporter_user_id = auth.uid() or public.is_admin());

drop policy if exists "tickets_insert_own" on public.support_tickets;
create policy "tickets_insert_own" on public.support_tickets
for insert with check (reporter_user_id = auth.uid());

drop policy if exists "tickets_update_admin_only" on public.support_tickets;
create policy "tickets_update_admin_only" on public.support_tickets
for update using (public.is_admin()) with check (public.is_admin());

-- Grants
-- Note: RLS policies are not enough; Postgres privileges must allow access.
-- These grants are safe to re-run.
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.drivers to authenticated;
grant select, insert, update, delete on table public.vehicles to authenticated;
grant select, insert, update, delete on table public.driver_locations to authenticated;
grant select on table public.pricing_rules to authenticated;
grant select, insert, update, delete on table public.rides to authenticated;
grant select, insert, update, delete on table public.ride_offers to authenticated;
grant select, insert, update, delete on table public.ratings to authenticated;
grant select, insert, update, delete on table public.support_tickets to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_ride_offer(uuid, uuid, public.offer_status) to anon, authenticated;
grant execute on function public.set_updated_at() to anon, authenticated;










