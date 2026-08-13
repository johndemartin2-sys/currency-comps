-- ============================================================================
-- RLS and row-level security policies for schema: public
-- Project: wqizwluccqqfkedpgvve (Comp Tool v1.0)  PostgreSQL 17.6
-- Extracted 2026-08-13 from live catalog (pg_policies, pg_class.relrowsecurity)
--
-- WHY THIS FILE EXISTS
--   None of these 22 policies appeared in any of the 33 recorded migrations or
--   in sql/01-05. The access-control posture of a public application existed
--   nowhere in version control. This file is that record.
--
-- STATUS: reference snapshot, NOT a migration.
--   Do not add to supabase/migrations/ -- these objects already exist in prod.
--   Replay order matters: policies referencing has_entitlement(), is_admin(),
--   and is_paid_member() require those functions to exist first.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Row level security enabled (41 tables)
-- ---------------------------------------------------------------------------
alter table public.backfill_log_ingester_defs enable row level security;
alter table public.backfill_log_phase1a enable row level security;
alter table public.backfill_log_phase1b enable row level security;
alter table public.bak_denom_cents_20260706 enable row level security;
alter table public.bak_fr_normalize_catalog_20260630 enable row level security;
alter table public.bak_fr_normalize_lots_20260630 enable row level security;
alter table public.bak_frcanon_exp_20260803 enable row level security;
alter table public.bak_multifr_20260803 enable row level security;
alter table public.catalog_master enable row level security;
alter table public.catalog_master_conflicts enable row level security;
alter table public.coin_mintages enable row level security;
alter table public.coin_types enable row level security;
alter table public.confederate_catalog enable row level security;
alter table public.confederate_catalog_draft enable row level security;
alter table public.currency_catalog enable row level security;
alter table public.currency_census_auctions enable row level security;
alter table public.currency_series_counts enable row level security;
alter table public.fr_rollback_20260728 enable row level security;
alter table public.grade_est_backup_20260728 enable row level security;
alter table public.grade_map_changed enable row level security;
alter table public.grade_text_map enable row level security;
alter table public.grade_text_map_new enable row level security;
alter table public.grade_text_rules enable row level security;
alter table public.harvest_expectations enable row level security;
alter table public.ingest_guard_config enable row level security;
alter table public.large_currency_census enable row level security;
alter table public.large_fr_catalog enable row level security;
alter table public.lots_coins enable row level security;
alter table public.lots_currency enable row level security;
alter table public.lots_currency_backup_seriestype enable row level security;
alter table public.lots_import_log enable row level security;
alter table public.national_bank_charters enable row level security;
alter table public.national_charter_catalog enable row level security;
alter table public.national_currency_census enable row level security;
alter table public.profiles enable row level security;
alter table public.review_rollback_20260728 enable row level security;
alter table public.scrape_progress enable row level security;
alter table public.search_log enable row level security;
alter table public.small_currency_census enable row level security;
alter table public.small_fr_catalog enable row level security;
alter table public.user_entitlements enable row level security;

-- ---------------------------------------------------------------------------
-- Policies (22)
-- ---------------------------------------------------------------------------

create policy "read_series_counts"
  on public.currency_series_counts
  as PERMISSIVE for SELECT
  to anon, authenticated
  using (true);
create policy "public_read_large_currency_census"
  on public.large_currency_census
  as PERMISSIVE for SELECT
  to anon, authenticated
  using (true);
create policy "public_read_large_fr_catalog"
  on public.large_fr_catalog
  as PERMISSIVE for SELECT
  to anon, authenticated
  using (true);
create policy "lots_coins_public_insert"
  on public.lots_coins
  as PERMISSIVE for INSERT
  to anon, authenticated
  with check (true);
create policy "lots_coins_public_update"
  on public.lots_coins
  as PERMISSIVE for UPDATE
  to anon, authenticated
  using (true)
  with check (true);
create policy "paid members read coins"
  on public.lots_coins
  as PERMISSIVE for SELECT
  to public
  using (has_entitlement('coins'::text));
create policy "admin insert currency"
  on public.lots_currency
  as PERMISSIVE for INSERT
  to public
  with check (is_admin());
create policy "admin update currency"
  on public.lots_currency
  as PERMISSIVE for UPDATE
  to public
  using (is_admin())
  with check (is_admin());
create policy "paid members read currency"
  on public.lots_currency
  as PERMISSIVE for SELECT
  to public
  using (( SELECT is_paid_member() AS is_paid_member));
create policy "import_log_public_insert"
  on public.lots_import_log
  as PERMISSIVE for INSERT
  to anon, authenticated
  with check (true);
create policy "import_log_public_read"
  on public.lots_import_log
  as PERMISSIVE for SELECT
  to public
  using (true);
create policy "nbc_public_insert"
  on public.national_bank_charters
  as PERMISSIVE for INSERT
  to public
  with check (true);
create policy "nbc_public_read"
  on public.national_bank_charters
  as PERMISSIVE for SELECT
  to public
  using (true);
create policy "nbc_public_update"
  on public.national_bank_charters
  as PERMISSIVE for UPDATE
  to public
  using (true)
  with check (true);
create policy "public_read_national_charter_catalog"
  on public.national_charter_catalog
  as PERMISSIVE for SELECT
  to anon, authenticated
  using (true);
create policy "public_read_national_currency_census"
  on public.national_currency_census
  as PERMISSIVE for SELECT
  to anon, authenticated
  using (true);
create policy "read own profile"
  on public.profiles
  as PERMISSIVE for SELECT
  to public
  using ((auth.uid() = id));
create policy "update own profile"
  on public.profiles
  as PERMISSIVE for UPDATE
  to public
  using ((auth.uid() = id))
  with check ((auth.uid() = id));
create policy "anyone can insert"
  on public.search_log
  as PERMISSIVE for INSERT
  to anon, authenticated
  with check (true);
create policy "public_read_small_currency_census"
  on public.small_currency_census
  as PERMISSIVE for SELECT
  to anon, authenticated
  using (true);
create policy "public_read_small_fr_catalog"
  on public.small_fr_catalog
  as PERMISSIVE for SELECT
  to anon, authenticated
  using (true);
create policy "users read own entitlements"
  on public.user_entitlements
  as PERMISSIVE for SELECT
  to public
  using ((auth.uid() = user_id));
