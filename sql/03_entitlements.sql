-- ============================================================================
-- 03_entitlements.sql
-- Coin-side launch: per-product entitlements for a single login / two subs.
--
-- SAFE / ADDITIVE ONLY. Does NOT alter or drop anything the Currency app reads.
-- The existing is_paid_member() function and the "paid members read currency"
-- policy on lots_currency are LEFT UNTOUCHED, so the Currency side keeps working
-- exactly as-is (zero downtime). Run this whole file once in the Supabase
-- SQL Editor.
-- ============================================================================

-- 1) Entitlements table: one row per (user, product).
--    product is 'currency' or 'coins'. A bundle grants BOTH (two rows).
create table if not exists public.user_entitlements (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  product       text not null check (product in ('currency','coins')),
  status        text not null default 'active' check (status in ('active','canceled','past_due')),
  source        text,                       -- e.g. 'stripe', 'backfill', 'manual'
  stripe_subscription_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, product)
);

create index if not exists user_entitlements_user_idx
  on public.user_entitlements (user_id);

-- 2) Lock the table down with RLS. Users may READ their own entitlements only.
--    Writes happen server-side (service role bypasses RLS via the webhook).
alter table public.user_entitlements enable row level security;

drop policy if exists "users read own entitlements" on public.user_entitlements;
create policy "users read own entitlements"
  on public.user_entitlements
  for select
  using (auth.uid() = user_id);

-- 3) Generalized entitlement check, usable in RLS policies.
create or replace function public.has_entitlement(p_product text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_entitlements e
    where e.user_id = auth.uid()
      and e.product = p_product
      and e.status  = 'active'
  );
$$;

-- 4) Backfill: every existing ACTIVE subscriber gets a 'currency' entitlement,
--    so nobody loses access. Idempotent thanks to the unique constraint.
insert into public.user_entitlements (user_id, product, status, source)
select p.id, 'currency', 'active', 'backfill'
from public.profiles p
where p.subscription_status = 'active'
on conflict (user_id, product) do nothing;

-- 5) Coins gating. lots_coins is currently world-readable
--    (policy: lots_coins_public_read, qual = true). Replace that with an
--    entitlement gate so coin data requires a paid coins (or bundle) sub.
--    NOTE: this affects ONLY lots_coins, never lots_currency.
drop policy if exists "lots_coins_public_read" on public.lots_coins;

drop policy if exists "paid members read coins" on public.lots_coins;
create policy "paid members read coins"
  on public.lots_coins
  for select
  using (public.has_entitlement('coins'));

-- ============================================================================
-- ROLLBACK (only if needed):
--   drop policy if exists "paid members read coins" on public.lots_coins;
--   create policy "lots_coins_public_read" on public.lots_coins for select using (true);
--   drop function if exists public.has_entitlement(text);
--   drop table if exists public.user_entitlements;
-- ============================================================================
