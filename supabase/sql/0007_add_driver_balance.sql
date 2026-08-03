-- Add driver balance_cents column for wallet feature
alter table public.drivers add column if not exists balance_cents integer not null default 0;
