-- ============================================================================
-- schema.sql — snapshot of schema "public"
-- Project: wqizwluccqqfkedpgvve (Comp Tool v1.0)   PostgreSQL 17.6
-- Generated 2026-08-13 from the live catalog via export_schema.sql
--
-- CONTENTS (401 statements)
--     8  enum types
--    41  tables
--    47  constraints
--    81  indexes
--    42  functions / procedures
--     9  views and materialized views
--    12  triggers
--   127  function-level GRANTs
--
-- STATUS: reference record, NOT a migration.
--   Do NOT place in supabase/migrations/ — these objects already exist.
--   Its job is to answer "what does production actually look like", which
--   the 32 recorded migrations only partially cover.
--
-- DELIBERATELY EXCLUDED
--   * Objects owned by extensions (pg_trgm and friends). pg_dump omits these
--     too; they return via CREATE EXTENSION.
--   * RLS enablement and the 22 policies — see supabase/rls_policies.sql.
--   * Blanket table-level GRANTs to anon/authenticated/service_role. Supabase
--     applies these uniformly (~1,040 statements of identical boilerplate).
--     Function grants ARE included: pg_get_functiondef() omits them, and one
--     was nearly lost when sql/02 was regenerated.
--   * Table DATA. Schema only.
--
-- KNOWN LIMITS — read before trusting this to rebuild anything
--   * Ordered by object class, not dependency. Replaying top-to-bottom into an
--     empty database will need reordering (e.g. views before the functions
--     they call).
--   * Does not emit COMMENT ON, ALTER DEFAULT PRIVILEGES, sequence ownership,
--     publications, or anything outside schema "public".
--   * Reconstructed from system catalogs, not produced by pg_dump. Treat as an
--     accurate INVENTORY; verify against a scratch database before relying on
--     it as a rebuild script.
-- ============================================================================

create type public.category_enum as enum ('currency', 'coins', 'world_coins', 'exonumia', 'ancients', 'other');

create type public.coin_strike_type as enum ('Business', 'Proof', 'Reverse Proof', 'Specimen', 'Pattern', 'Silver Proof');

create type public.currency_type_class_enum as enum ('large_size', 'small_size', 'national_bank_note', 'federal_reserve_note', 'silver_certificate', 'gold_certificate', 'legal_tender', 'fractional', 'colonial_continental', 'obsolete', 'confederate', 'mpc_military', 'error_note', 'world_currency', 'other', 'federal_reserve_bank_note', 'treasury_note', 'demand_note', 'interest_bearing_note', 'refunding_certificate', 'encased_postage');

create type public.grading_company_enum as enum ('PMG', 'PCGS', 'NGC', 'CGA', 'CGC', 'IPG', 'ANACS', 'raw', 'unknown', 'CACG', 'ICG', 'SEGS', 'PCI', 'NCS');

create type public.ppq_epq_enum as enum ('PPQ', 'EPQ', 'none');

create type public.price_kind_enum as enum ('hammer', 'realized', 'estimate_low', 'estimate_high', 'unknown');

create type public.seller_enum as enum ('heritage_auctions', 'stacks_bowers', 'ebay', 'other');

create type public.type_class_enum as enum ('large_size', 'small_size', 'national_bank_note', 'silver_certificate', 'gold_certificate', 'legal_tender', 'federal_reserve_note', 'federal_reserve_bank_note', 'treasury_note', 'demand_note', 'interest_bearing_note', 'refunding_certificate', 'compound_interest_treasury_note', 'fractional', 'colonial_continental', 'obsolete', 'confederate', 'error_note', 'mpc_military', 'encased_postage', 'national_gold_bank_note', 'world_currency', 'other');

create table if not exists public.backfill_log_ingester_defs (
  proname text,
  oid oid,
  def text,
  snapshot_at timestamp with time zone default now()
);

create table if not exists public.backfill_log_phase1a (
  row_id integer,
  fr_key text,
  old_series_year text,
  old_districts_letters text,
  snapshot_at timestamp with time zone
);

create table if not exists public.backfill_log_phase1b (
  row_id integer,
  fr_key text,
  old_series_year text,
  picked_year text,
  yr_cnt bigint,
  total_hits numeric,
  snapshot_at timestamp with time zone
);

create table if not exists public.bak_denom_cents_20260706 (
  id bigint,
  title text,
  denomination text,
  denomination_canonical text,
  type_class_txt text,
  denom_num integer,
  cent_numbers text[],
  bucket text,
  dollar_numbers text[],
  distinct_denoms text[]
);

create table if not exists public.bak_fr_normalize_catalog_20260630 (
  row_id integer,
  orig_fr_number text,
  orig_fr_key text,
  snapshot_at timestamp with time zone
);

create table if not exists public.bak_fr_normalize_lots_20260630 (
  id bigint,
  orig_friedberg_number text,
  snapshot_at timestamp with time zone
);

create table if not exists public.bak_frcanon_exp_20260803 (
  id bigint,
  source seller_enum,
  source_lot_id text,
  lot_url text,
  title text,
  sold_on date,
  sold_year integer,
  price_realized numeric(14,2),
  price_kind price_kind_enum,
  price_estimate_low numeric(14,2),
  price_estimate_high numeric(14,2),
  currency_code character(3),
  type_class currency_type_class_enum,
  series_date text,
  series_type text,
  denomination text,
  denomination_raw text,
  friedberg_number text,
  friedberg_number_normalized text,
  grading_company grading_company_enum,
  grade_raw text,
  grade_numeric integer,
  ppq_epq ppq_epq_enum,
  serial_number text,
  signatures text,
  is_star_note boolean,
  auction_event_id text,
  auction_event_name text,
  thumbnail_url text,
  raw jsonb,
  scraped_at timestamp with time zone,
  updated_at timestamp with time zone,
  state_code text,
  charter_number text,
  data_quality text,
  series_year integer,
  series_letter text,
  classified_by text,
  catalog_number text,
  catalog_system text,
  catalog_source text,
  friedberg_base text,
  series_canonical text,
  needs_review boolean,
  denomination_canonical text,
  is_mixed_denomination boolean,
  grade_numeric_est integer,
  grade_grade_source text,
  fr_canon text,
  fr_base_canon text,
  review_reason text,
  search_visible boolean,
  backed_up_at timestamp with time zone
);

create table if not exists public.bak_multifr_20260803 (
  id bigint,
  source seller_enum,
  source_lot_id text,
  lot_url text,
  title text,
  sold_on date,
  sold_year integer,
  price_realized numeric(14,2),
  price_kind price_kind_enum,
  price_estimate_low numeric(14,2),
  price_estimate_high numeric(14,2),
  currency_code character(3),
  type_class currency_type_class_enum,
  series_date text,
  series_type text,
  denomination text,
  denomination_raw text,
  friedberg_number text,
  friedberg_number_normalized text,
  grading_company grading_company_enum,
  grade_raw text,
  grade_numeric integer,
  ppq_epq ppq_epq_enum,
  serial_number text,
  signatures text,
  is_star_note boolean,
  auction_event_id text,
  auction_event_name text,
  thumbnail_url text,
  raw jsonb,
  scraped_at timestamp with time zone,
  updated_at timestamp with time zone,
  state_code text,
  charter_number text,
  data_quality text,
  series_year integer,
  series_letter text,
  classified_by text,
  catalog_number text,
  catalog_system text,
  catalog_source text,
  friedberg_base text,
  series_canonical text,
  needs_review boolean,
  denomination_canonical text,
  is_mixed_denomination boolean,
  grade_numeric_est integer,
  grade_grade_source text,
  fr_canon text,
  fr_base_canon text,
  review_reason text,
  search_visible boolean,
  is_multi_fr_lot boolean
);

create table if not exists public.catalog_master (
  row_id integer not null,
  fr_number text not null,
  fr_key text generated always as (lower(fr_number)) stored,
  size_category text,
  type text,
  denomination text,
  denomination_value numeric,
  series_year text,
  signatures text,
  seal text,
  district text,
  districts_letters text,
  city_location text,
  bank text,
  bank_signatures text,
  type_variant text,
  notes text,
  source text,
  imported_at timestamp with time zone default now(),
  status text default 'curated'::text not null,
  fr_join_key text generated always as (fr_canon(fr_number)) stored,
  catalog_system text default 'friedberg'::text not null
);

create table if not exists public.catalog_master_conflicts (
  row_id integer not null,
  fr_number text not null,
  fr_key text generated always as (lower(fr_number)) stored,
  size_category text,
  type text,
  denomination text,
  denomination_value numeric,
  series_year text,
  signatures text,
  seal text,
  district text,
  districts_letters text,
  city_location text,
  bank text,
  bank_signatures text,
  type_variant text,
  notes text,
  source text,
  imported_at timestamp with time zone default now(),
  status text default 'curated'::text not null
);

create table if not exists public.coin_mintages (
  issue_id text not null,
  type_id text not null,
  year integer not null,
  mintmark text,
  mint text not null,
  strike_type coin_strike_type default 'Business'::coin_strike_type not null,
  variety text,
  mintage bigint,
  source text not null,
  source_date date,
  notes text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.coin_types (
  type_id text not null,
  category text not null,
  subcategory text,
  coin_name text not null,
  denomination text,
  face_value numeric(12,3),
  metal text,
  years_issued text,
  status text,
  designer text,
  diameter_mm text,
  pcgs_number text,
  ngc_number text,
  red_book_ref text,
  notes text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.confederate_catalog (
  catalog_number text,
  t_sort integer,
  catalog_system text,
  denomination text,
  series_year integer,
  type_class text,
  source text,
  imported_at timestamp with time zone,
  issue_series text,
  authorizing_act text,
  date_on_note text,
  design_vignette text,
  portraits_subjects text,
  printer_engraver text,
  qty_issued text,
  criswell_number text,
  notes text
);

create table if not exists public.confederate_catalog_draft (
  catalog_number text,
  t_sort integer,
  catalog_system text,
  denomination text,
  series_year integer,
  type_class text,
  source text,
  imported_at timestamp with time zone,
  issue_series text,
  authorizing_act text,
  date_on_note text,
  design_vignette text,
  portraits_subjects text,
  printer_engraver text,
  qty_issued text,
  criswell_number text,
  notes text
);

create table if not exists public.currency_catalog (
  catalog_id bigint generated always as identity not null,
  catalog_system text default 'friedberg'::text not null,
  catalog_prefix text,
  catalog_number text not null,
  catalog_suffix text,
  catalog_label text,
  fr_number text,
  fr_key text,
  size_category text,
  type text,
  denomination text,
  denomination_value numeric,
  series_year text,
  signatures text,
  seal text,
  district text,
  districts_letters text,
  city_location text,
  bank text,
  bank_signatures text,
  type_variant text,
  notes text,
  source text,
  status text default 'curated'::text not null,
  imported_at timestamp with time zone default now(),
  is_star boolean default false not null,
  is_specimen boolean default false not null
);

create table if not exists public.currency_census_auctions (
  id bigint default nextval('currency_census_auctions_id_seq'::regclass) not null,
  source_site text default 'trackandpriceus.com'::text,
  charter_number integer,
  type_code text,
  denomination text,
  serial_number text,
  sheet_position text,
  grade_raw text,
  grade_numeric integer,
  grading_company text,
  ppq_epq text,
  price numeric,
  sold_on date,
  source text,
  source_lot_no text,
  source_lot_id text,
  comments text,
  raw text,
  imported_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  is_sheet_note boolean default false
);

create table if not exists public.currency_series_counts (
  series_canonical text not null,
  n bigint default 0 not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.fr_rollback_20260728 (
  obj text not null,
  kind text,
  definition text,
  indexes text,
  grants text,
  captured_at timestamp with time zone default now() not null,
  relacl text
);

create table if not exists public.grade_est_backup_20260728 (
  id bigint,
  updated_at timestamp with time zone,
  friedberg_number text,
  series_type text,
  denomination text,
  series_year integer,
  denomination_canonical text,
  is_mixed_denomination boolean,
  type_class currency_type_class_enum,
  grade_numeric integer
);

create table if not exists public.grade_map_changed (
  g text
);

create table if not exists public.grade_text_map (
  g text not null,
  num integer,
  source text not null,
  detail text
);

create table if not exists public.grade_text_map_new (
  g text,
  num integer,
  source text,
  detail text
);

create table if not exists public.grade_text_rules (
  id integer default nextval('grade_text_rules_id_seq'::regclass) not null,
  pattern text not null,
  val integer not null,
  label text not null
);

create table if not exists public.harvest_expectations (
  id bigint default nextval('harvest_expectations_id_seq'::regclass) not null,
  source text default 'heritage'::text not null,
  category text not null,
  denomination text not null,
  series_year integer not null,
  ha_desig text not null,
  expected_n integer not null,
  captured_at timestamp with time zone default now() not null
);

create table if not exists public.ingest_guard_config (
  key text not null,
  value text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.large_currency_census (
  id bigint generated always as identity not null,
  source_site text default 'trackandprice_us'::text not null,
  fr_number text not null,
  denomination text,
  note_type text,
  district text,
  series text,
  description text,
  fed_signature text,
  bank_signature text,
  serial_number text,
  is_star boolean default false not null,
  grade_raw text,
  grade_numeric integer,
  grading_company text default 'unknown'::text not null,
  grading_company_raw text,
  ppq_epq text default 'none'::text not null,
  pq_raw text,
  note_series text,
  sheet text,
  comments text,
  dedup_key text generated always as (lower(((((((((((source_site || '|'::text) || fr_number) || '|'::text) || serial_number) || '|'::text) || COALESCE(grade_raw, ''::text)) || '|'::text) || COALESCE(grading_company_raw, ''::text)) || '|'::text) || (is_star)::text))) stored,
  loaded_at timestamp with time zone default now() not null,
  denomination_raw text,
  regular_count integer,
  star_count integer
);

create table if not exists public.large_fr_catalog (
  fr_number text not null,
  source_site text default 'trackandprice_us'::text not null,
  denomination text,
  denomination_raw text,
  note_type text,
  district text,
  series text,
  description text,
  fed_signature text,
  bank_signature text,
  total_population integer default 0 not null,
  regular_count integer default 0 not null,
  star_count integer default 0 not null,
  graded_count integer default 0 not null,
  top_grade integer,
  grade_distribution jsonb,
  grader_distribution jsonb,
  loaded_at timestamp with time zone default now() not null
);

create table if not exists public.lots_coins (
  id bigint default nextval('lots_coins_id_seq'::regclass) not null,
  source seller_enum not null,
  source_lot_id text not null,
  lot_url text not null,
  title text not null,
  sold_on date,
  sold_year integer generated always as ((EXTRACT(year FROM sold_on))::integer) stored,
  price_realized numeric(14,2),
  price_kind price_kind_enum default 'unknown'::price_kind_enum not null,
  price_estimate_low numeric(14,2),
  price_estimate_high numeric(14,2),
  currency_code character(3),
  series_year integer,
  denomination text,
  denomination_raw text,
  variety text,
  die_state text,
  rarity text,
  grading_company grading_company_enum default 'unknown'::grading_company_enum not null,
  grade_raw text,
  grade_numeric integer,
  has_cac boolean default false not null,
  has_plus boolean default false not null,
  pcgs_number text,
  designation text,
  auction_event_id text,
  auction_event_name text,
  thumbnail_url text,
  raw jsonb not null,
  scraped_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  category text,
  color text,
  strike_designation text,
  surface_designation text,
  grade_display text generated always as (NULLIF((((((COALESCE(grade_raw, ''::text) ||
CASE
    WHEN has_plus THEN '+'::text
    ELSE ''::text
END) || COALESCE((' '::text || color), ''::text)) || COALESCE((' '::text || strike_designation), ''::text)) || COALESCE((' '::text || surface_designation), ''::text)) ||
CASE
    WHEN has_cac THEN ' CAC'::text
    ELSE ''::text
END), ''::text)) stored,
  strike_type text,
  ha_category text,
  grade_numeric_est integer,
  grade_grade_source text
);

create table if not exists public.lots_currency (
  id bigint default nextval('lots_currency_id_seq'::regclass) not null,
  source seller_enum not null,
  source_lot_id text not null,
  lot_url text not null,
  title text,
  sold_on date,
  sold_year integer generated always as ((EXTRACT(year FROM sold_on))::integer) stored,
  price_realized numeric(14,2),
  price_kind price_kind_enum default 'unknown'::price_kind_enum not null,
  price_estimate_low numeric(14,2),
  price_estimate_high numeric(14,2),
  currency_code character(3),
  type_class currency_type_class_enum,
  series_date text,
  series_type text,
  denomination text,
  denomination_raw text,
  friedberg_number text,
  grading_company grading_company_enum default 'unknown'::grading_company_enum,
  grade_raw text,
  grade_numeric integer,
  ppq_epq ppq_epq_enum default 'none'::ppq_epq_enum,
  serial_number text,
  signatures text,
  is_star_note boolean default false not null,
  auction_event_id text,
  auction_event_name text,
  thumbnail_url text,
  raw jsonb not null,
  scraped_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  state_code text,
  charter_number text,
  data_quality text default 'unverified'::text not null,
  series_year integer,
  series_letter text,
  classified_by text,
  catalog_number text,
  catalog_system text,
  catalog_source text,
  friedberg_base text generated always as (NULLIF(regexp_replace(COALESCE(friedberg_number, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text)) stored,
  series_canonical text,
  needs_review boolean default false not null,
  denomination_canonical text,
  is_mixed_denomination boolean default false not null,
  grade_numeric_est integer,
  grade_grade_source text,
  fr_canon text,
  fr_base_canon text,
  review_reason text,
  search_visible boolean,
  is_multi_fr_lot boolean default false not null,
  friedberg_number_normalized text generated always as (lower(regexp_replace(COALESCE(friedberg_number, ''::text), '[^0-9A-Za-z]'::text, ''::text, 'g'::text))) stored,
  title_fts tsvector generated always as (to_tsvector('simple'::regconfig, COALESCE(title, ''::text))) stored
);

create table if not exists public.lots_currency_backup_seriestype (
  id bigint,
  series_type text,
  type_class currency_type_class_enum
);

create table if not exists public.lots_import_log (
  id bigint default nextval('lots_import_log_id_seq'::regclass) not null,
  started_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  source seller_enum not null,
  category category_enum not null,
  scraper_version text not null,
  rows_attempted integer,
  rows_inserted integer,
  rows_updated integer,
  rows_skipped integer,
  notes text
);

create table if not exists public.national_bank_charters (
  charter_number integer not null,
  title_no integer default 1 not null,
  state_code character(2),
  town text,
  bank_name text,
  org_date text,
  charter_date text,
  open_date text,
  opening_comment text,
  close_date text,
  fate text,
  last_circulation text,
  history text,
  raw jsonb,
  scraped_at timestamp with time zone default now() not null
);

create table if not exists public.national_charter_catalog (
  charter_number text not null,
  source_site text,
  state_code text,
  city text,
  bank_name text,
  total_population integer,
  large_note_count integer,
  small_note_count integer,
  graded_count integer,
  top_grade integer,
  grade_distribution jsonb,
  grader_distribution jsonb,
  type_distribution jsonb,
  denomination_distribution jsonb,
  loaded_at timestamp with time zone default now()
);

create table if not exists public.national_currency_census (
  id bigint generated always as identity not null,
  source_site text default 'trackandprice_us'::text not null,
  charter_number text,
  state_code text,
  city text,
  bank_name text,
  large_count integer,
  small_count integer,
  type_code text,
  series_type text,
  denomination text,
  grade_raw text,
  grade_numeric integer,
  grading_company grading_company_enum default 'unknown'::grading_company_enum,
  grading_company_raw text,
  ppq_epq ppq_epq_enum default 'none'::ppq_epq_enum,
  pq_raw text,
  serial_number text,
  sheet_position text,
  comments text,
  raw jsonb,
  imported_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_sheet_note boolean default false,
  dedup_key text generated always as (lower(((((((((((((((COALESCE(source_site, ''::text) || '|'::text) || COALESCE(charter_number, ''::text)) || '|'::text) || COALESCE(type_code, ''::text)) || '|'::text) || COALESCE(denomination, ''::text)) || '|'::text) || COALESCE(serial_number, ''::text)) || '|'::text) || COALESCE(sheet_position, ''::text)) || '|'::text) || COALESCE(grade_raw, ''::text)) || '|'::text) || COALESCE(grading_company_raw, ''::text)))) stored
);

create table if not exists public.profiles (
  id uuid not null,
  email text,
  subscription_status text default 'inactive'::text not null,
  tier text default 'starter'::text,
  stripe_customer_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  is_admin boolean default false not null
);

create table if not exists public.review_rollback_20260728 (
  obj text not null,
  kind text,
  definition text,
  indexes text,
  grants text,
  relacl text,
  captured_at timestamp with time zone default now() not null
);

create table if not exists public.scrape_progress (
  id integer default nextval('scrape_progress_id_seq'::regclass) not null,
  source text not null,
  scope text not null,
  page_done integer default 0 not null,
  total_pages integer,
  last_lot_url text,
  session_started_at timestamp with time zone,
  session_ended_at timestamp with time zone,
  lots_seen_total integer default 0,
  lots_inserted integer default 0,
  lots_updated integer default 0,
  consecutive_dupe_pages integer default 0,
  notes text,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.search_log (
  id bigint generated always as identity not null,
  created_at timestamp with time zone default now() not null,
  session_id text,
  title_query text,
  filters jsonb,
  mode text,
  result_count integer,
  duration_ms integer,
  user_id uuid default auth.uid()
);

create table if not exists public.small_currency_census (
  id bigint generated always as identity not null,
  source_site text,
  fr_number text,
  denomination numeric,
  denomination_raw text,
  note_type text,
  district text,
  series text,
  description text,
  fed_signature text,
  bank_signature text,
  regular_count integer,
  star_count integer,
  serial_number text,
  is_star boolean default false,
  grade_raw text,
  grade_numeric integer,
  grading_company text default 'unknown'::text,
  grading_company_raw text,
  ppq_epq text default 'none'::text,
  pq_raw text,
  note_series text,
  sheet text,
  set_num text,
  pack text,
  comments text,
  dedup_key text generated always as (lower(((((((((((COALESCE(source_site, ''::text) || '|'::text) || COALESCE(fr_number, ''::text)) || '|'::text) || COALESCE(serial_number, ''::text)) || '|'::text) || COALESCE(grade_raw, ''::text)) || '|'::text) || COALESCE(grading_company_raw, ''::text)) || '|'::text) || (is_star)::text))) stored,
  loaded_at timestamp with time zone default now()
);

create table if not exists public.small_fr_catalog (
  fr_number text not null,
  source_site text,
  denomination numeric,
  denomination_raw text,
  note_type text,
  district text,
  series text,
  description text,
  fed_signature text,
  bank_signature text,
  total_population integer,
  regular_count integer,
  star_count integer,
  graded_count integer,
  top_grade integer,
  grade_distribution jsonb,
  grader_distribution jsonb,
  loaded_at timestamp with time zone default now()
);

create table if not exists public.user_entitlements (
  id bigint generated always as identity not null,
  user_id uuid not null,
  product text not null,
  status text default 'active'::text not null,
  source text,
  stripe_subscription_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

alter table public.catalog_master add constraint friedberg_catalog_pkey PRIMARY KEY (row_id);

alter table public.coin_mintages add constraint coin_mintages_type_id_fkey FOREIGN KEY (type_id) REFERENCES coin_types(type_id) ON UPDATE CASCADE ON DELETE RESTRICT;

alter table public.coin_mintages add constraint coin_mintages_pkey PRIMARY KEY (issue_id);

alter table public.coin_types add constraint coin_types_pkey PRIMARY KEY (type_id);

alter table public.currency_catalog add constraint currency_catalog_system_chk CHECK ((catalog_system = ANY (ARRAY['friedberg'::text, 'confederate_t'::text, 'haxby'::text, 'milton'::text, 'newman'::text, 'other'::text])));

alter table public.currency_catalog add constraint currency_catalog_pkey PRIMARY KEY (catalog_id);

alter table public.currency_census_auctions add constraint currency_census_auctions_pkey PRIMARY KEY (id);

alter table public.currency_series_counts add constraint currency_series_counts_pkey PRIMARY KEY (series_canonical);

alter table public.fr_rollback_20260728 add constraint fr_rollback_20260728_pkey PRIMARY KEY (obj);

alter table public.grade_text_map add constraint grade_text_map_pkey PRIMARY KEY (g);

alter table public.grade_text_rules add constraint grade_text_rules_pkey PRIMARY KEY (id);

alter table public.harvest_expectations add constraint harvest_expectations_pkey PRIMARY KEY (id);

alter table public.harvest_expectations add constraint harvest_expectations_uniq UNIQUE (source, category, denomination, series_year, ha_desig);

alter table public.ingest_guard_config add constraint ingest_guard_config_pkey PRIMARY KEY (key);

alter table public.large_currency_census add constraint large_currency_census_pkey PRIMARY KEY (id);

alter table public.large_fr_catalog add constraint large_fr_catalog_pkey PRIMARY KEY (fr_number);

alter table public.lots_coins add constraint lots_coins_grade_numeric_est_range CHECK (((grade_numeric_est IS NULL) OR ((grade_numeric_est >= 1) AND (grade_numeric_est <= 70))));

alter table public.lots_coins add constraint lots_coins_grade_range CHECK (((grade_numeric IS NULL) OR ((grade_numeric >= 1) AND (grade_numeric <= 70))));

alter table public.lots_coins add constraint lots_coins_uniq UNIQUE (source, source_lot_id);

alter table public.lots_coins add constraint lots_coins_strike_type_chk CHECK (((strike_type IS NULL) OR (strike_type = ANY (ARRAY['PROOF'::text, 'BUSINESS'::text, 'SPECIMEN'::text]))));

alter table public.lots_coins add constraint lots_coins_pkey PRIMARY KEY (id);

alter table public.lots_currency add constraint lots_currency_fr_canon_fkey FOREIGN KEY (fr_canon) REFERENCES catalog_master(fr_join_key) ON UPDATE CASCADE ON DELETE RESTRICT;

alter table public.lots_currency add constraint lots_currency_data_quality_chk CHECK ((data_quality = ANY (ARRAY['unverified'::text, 'trusted'::text, 'quarantined'::text, 'rescraped'::text])));

alter table public.lots_currency add constraint lots_currency_pkey PRIMARY KEY (id);

alter table public.lots_currency add constraint lots_currency_charter_number_chk CHECK (((charter_number IS NULL) OR (charter_number ~ '^[0-9]{1,6}$'::text)));

alter table public.lots_currency add constraint lots_currency_series_type_not_bare CHECK (((series_type IS NULL) OR (series_type !~ '^[A-Z]$'::text)));

alter table public.lots_currency add constraint lots_currency_state_code_chk CHECK (((state_code IS NULL) OR (state_code ~ '^[A-Z]{2}$'::text)));

alter table public.lots_currency add constraint lots_currency_uniq UNIQUE (source, source_lot_id);

alter table public.lots_currency add constraint lots_currency_grade_range CHECK (((grade_numeric IS NULL) OR ((grade_numeric >= 1) AND (grade_numeric <= 70))));

alter table public.lots_import_log add constraint lots_import_log_pkey PRIMARY KEY (id);

alter table public.national_bank_charters add constraint national_bank_charters_pkey PRIMARY KEY (charter_number, title_no);

alter table public.national_charter_catalog add constraint national_charter_catalog_pkey PRIMARY KEY (charter_number);

alter table public.national_currency_census add constraint currency_census_pkey PRIMARY KEY (id);

alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.review_rollback_20260728 add constraint review_rollback_20260728_pkey PRIMARY KEY (obj);

alter table public.scrape_progress add constraint scrape_progress_source_scope_key UNIQUE (source, scope);

alter table public.scrape_progress add constraint scrape_progress_pkey PRIMARY KEY (id);

alter table public.search_log add constraint search_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.search_log add constraint search_log_pkey PRIMARY KEY (id);

alter table public.small_currency_census add constraint small_currency_census_pkey PRIMARY KEY (id);

alter table public.small_fr_catalog add constraint small_fr_catalog_pkey PRIMARY KEY (fr_number);

alter table public.user_entitlements add constraint user_entitlements_pkey PRIMARY KEY (id);

alter table public.user_entitlements add constraint user_entitlements_product_check CHECK ((product = ANY (ARRAY['currency'::text, 'coins'::text])));

alter table public.user_entitlements add constraint user_entitlements_user_id_product_key UNIQUE (user_id, product);

alter table public.user_entitlements add constraint user_entitlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.user_entitlements add constraint user_entitlements_status_check CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'past_due'::text])));

CREATE UNIQUE INDEX friedberg_catalog_fr_key_uniq ON public.catalog_master USING btree (fr_key);

CREATE INDEX idx_friedberg_catalog_fr_key ON public.catalog_master USING btree (fr_key);

CREATE UNIQUE INDEX friedberg_catalog_fr_join_key_uniq ON public.catalog_master USING btree (fr_join_key);

CREATE INDEX idx_coin_mintages_year ON public.coin_mintages USING btree (year);

CREATE INDEX idx_coin_mintages_strike ON public.coin_mintages USING btree (strike_type);

CREATE INDEX idx_coin_mintages_type ON public.coin_mintages USING btree (type_id);

CREATE INDEX idx_coin_types_denomination ON public.coin_types USING btree (denomination);

CREATE INDEX idx_coin_types_category ON public.coin_types USING btree (category);

CREATE INDEX idx_currency_catalog_fr_number ON public.currency_catalog USING btree (fr_number) WHERE (fr_number IS NOT NULL);

CREATE INDEX idx_currency_catalog_system_number ON public.currency_catalog USING btree (catalog_system, catalog_number);

CREATE INDEX idx_currency_catalog_is_specimen ON public.currency_catalog USING btree (is_specimen) WHERE (is_specimen = true);

CREATE UNIQUE INDEX uq_currency_catalog_sys_num_suffix ON public.currency_catalog USING btree (catalog_system, catalog_number, COALESCE(catalog_suffix, ''::text), is_star, is_specimen);

CREATE INDEX idx_currency_catalog_is_star ON public.currency_catalog USING btree (is_star) WHERE (is_star = true);

CREATE INDEX idx_currency_catalog_label ON public.currency_catalog USING btree (catalog_label);

CREATE INDEX grade_map_changed_g_idx ON public.grade_map_changed USING btree (g);

CREATE INDEX large_currency_census_star_idx ON public.large_currency_census USING btree (fr_number, is_star);

CREATE UNIQUE INDEX large_currency_census_dedup_idx ON public.large_currency_census USING btree (dedup_key);

CREATE INDEX large_currency_census_fr_idx ON public.large_currency_census USING btree (fr_number);

CREATE INDEX large_fr_catalog_type_idx ON public.large_fr_catalog USING btree (note_type);

CREATE INDEX large_fr_catalog_denom_idx ON public.large_fr_catalog USING btree (denomination);

CREATE INDEX lots_coins_series_year_idx ON public.lots_coins USING btree (series_year);

CREATE INDEX lots_coins_source_idx ON public.lots_coins USING btree (source);

CREATE INDEX lots_coins_grading_idx ON public.lots_coins USING btree (grading_company);

CREATE INDEX lots_coins_denom_idx ON public.lots_coins USING btree (denomination);

CREATE INDEX lots_coins_grade_num_idx ON public.lots_coins USING btree (grade_numeric);

CREATE INDEX lots_coins_sold_on_idx ON public.lots_coins USING btree (sold_on);

CREATE INDEX lots_coins_sold_year_idx ON public.lots_coins USING btree (sold_year);

CREATE INDEX lots_coins_price_idx ON public.lots_coins USING btree (price_realized);

CREATE INDEX lots_coins_cac_idx ON public.lots_coins USING btree (has_cac);

CREATE INDEX lots_coins_title_trgm_idx ON public.lots_coins USING gin (title gin_trgm_ops);

CREATE INDEX lots_coins_category_idx ON public.lots_coins USING btree (category);

CREATE INDEX lots_coins_strike_type_idx ON public.lots_coins USING btree (strike_type);

CREATE INDEX lots_coins_ha_category_year_idx ON public.lots_coins USING btree (ha_category, series_year);

CREATE INDEX idx_lots_currency_fr_trgm ON public.lots_currency USING gin (friedberg_number gin_trgm_ops);

CREATE INDEX lots_currency_price_idx ON public.lots_currency USING btree (price_realized);

CREATE INDEX lots_currency_star_idx ON public.lots_currency USING btree (is_star_note);

CREATE INDEX lots_currency_title_trgm_idx ON public.lots_currency USING gin (title gin_trgm_ops);

CREATE INDEX idx_lots_curr_data_quality ON public.lots_currency USING btree (data_quality) WHERE (data_quality = ANY (ARRAY['trusted'::text, 'rescraped'::text]));

CREATE UNIQUE INDEX idx_lots_curr_source_lot ON public.lots_currency USING btree (source, source_lot_id);

CREATE INDEX idx_lots_currency_data_quality_full ON public.lots_currency USING btree (data_quality);

CREATE INDEX lots_currency_friedberg_base_idx ON public.lots_currency USING btree (friedberg_base);

CREATE INDEX idx_lots_curr_canon_sold ON public.lots_currency USING btree (series_canonical, sold_on DESC NULLS LAST) WHERE (needs_review = false);

CREATE INDEX idx_lots_curr_canon ON public.lots_currency USING btree (series_canonical);

CREATE INDEX idx_lots_currency_grade_numeric_est ON public.lots_currency USING btree (grade_numeric_est);

CREATE INDEX idx_lots_currency_fr_canon ON public.lots_currency USING btree (fr_canon) WHERE (fr_canon IS NOT NULL);

CREATE INDEX idx_lots_currency_fr_base_canon ON public.lots_currency USING btree (fr_base_canon) WHERE (fr_base_canon IS NOT NULL);

CREATE INDEX idx_lots_currency_review_reason ON public.lots_currency USING btree (review_reason) WHERE (review_reason IS NOT NULL);

CREATE INDEX idx_lots_curr_fr_norm ON public.lots_currency USING btree (friedberg_number_normalized);

CREATE INDEX idx_lots_currency_title_fts ON public.lots_currency USING gin (title_fts);

CREATE INDEX lots_currency_type_class_idx ON public.lots_currency USING btree (type_class);

CREATE INDEX idx_lots_curr_source ON public.lots_currency USING btree (source);

CREATE INDEX idx_lots_currency_charter_trgm ON public.lots_currency USING gin (charter_number gin_trgm_ops);

CREATE INDEX idx_lots_curr_sold_on ON public.lots_currency USING btree (sold_on);

CREATE INDEX lots_currency_grade_num_idx ON public.lots_currency USING btree (grade_numeric);

CREATE INDEX lots_currency_state_code_idx ON public.lots_currency USING btree (state_code) WHERE (state_code IS NOT NULL);

CREATE INDEX lots_currency_sold_year_idx ON public.lots_currency USING btree (sold_year);

CREATE INDEX lots_currency_charter_number_idx ON public.lots_currency USING btree (charter_number) WHERE (charter_number IS NOT NULL);

CREATE INDEX idx_lots_currency_sold_on_desc ON public.lots_currency USING btree (sold_on DESC NULLS LAST);

CREATE INDEX idx_lots_currency_title_trgm ON public.lots_currency USING gin (title gin_trgm_ops);

CREATE INDEX lots_currency_denom_idx ON public.lots_currency USING btree (denomination);

CREATE INDEX lots_currency_series_date_idx ON public.lots_currency USING btree (series_date);

CREATE INDEX lots_currency_ppq_idx ON public.lots_currency USING btree (ppq_epq);

CREATE INDEX lots_currency_grading_idx ON public.lots_currency USING btree (grading_company);

CREATE INDEX lots_import_log_started_idx ON public.lots_import_log USING btree (started_at);

CREATE INDEX nbc_state_town_idx ON public.national_bank_charters USING btree (state_code, town);

CREATE INDEX nbc_charter_idx ON public.national_bank_charters USING btree (charter_number);

CREATE INDEX natcat_state_idx ON public.national_charter_catalog USING btree (state_code);

CREATE INDEX natcat_bank_idx ON public.national_charter_catalog USING btree (bank_name);

CREATE UNIQUE INDEX currency_census_dedup_key_idx ON public.national_currency_census USING btree (dedup_key);

CREATE INDEX national_currency_census_charter_idx ON public.national_currency_census USING btree (charter_number);

CREATE INDEX idx_search_log_user_created ON public.search_log USING btree (user_id, created_at);

CREATE INDEX search_log_created_at_idx ON public.search_log USING btree (created_at);

CREATE INDEX search_log_title_query_idx ON public.search_log USING btree (title_query);

CREATE INDEX small_star_idx ON public.small_currency_census USING btree (fr_number, is_star);

CREATE INDEX small_fr_idx ON public.small_currency_census USING btree (fr_number);

CREATE UNIQUE INDEX small_dedup_idx ON public.small_currency_census USING btree (dedup_key);

CREATE INDEX small_cat_type_idx ON public.small_fr_catalog USING btree (note_type);

CREATE INDEX small_cat_denom_idx ON public.small_fr_catalog USING btree (denomination);

CREATE UNIQUE INDEX title_word_freq_word_uidx ON public.title_word_freq USING btree (word);

CREATE INDEX title_word_freq_trgm ON public.title_word_freq USING gin (word gin_trgm_ops);

CREATE INDEX user_entitlements_user_idx ON public.user_entitlements USING btree (user_id);

CREATE OR REPLACE FUNCTION public.aaa_normalize_denomination_cents()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ DECLARE cent_nums text[]; dollar_nums text[]; distinct_nums text[]; BEGIN IF NEW.denomination ~ '^[0-9]+$' AND (NEW.title ~* '\d\s*¢' OR NEW.title ~* '\d+\s*cents?\y') THEN cent_nums := ARRAY(SELECT (m)[1] FROM regexp_matches(NEW.title, '(\d+)\s*(?:¢|cents?\y)', 'gi') AS m); dollar_nums := ARRAY(SELECT (m)[1] FROM regexp_matches(NEW.title, '\$(\d+)', 'g') AS m); distinct_nums := ARRAY(SELECT DISTINCT u FROM unnest(cent_nums || dollar_nums) AS u); IF cardinality(distinct_nums) > 1 THEN NEW.is_mixed_denomination := true; ELSIF cardinality(distinct_nums) = 1 THEN NEW.denomination := distinct_nums[1]; NEW.denomination_canonical := distinct_nums[1] || '¢'; NEW.is_mixed_denomination := false; END IF; END IF; RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.aaa_normalize_fr_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_fr text;
BEGIN
  v_fr := NEW.friedberg_number;
    IF v_fr IS NULL OR btrim(v_fr) = '' THEN RETURN NEW; END IF;
      v_fr := btrim(regexp_replace(v_fr, '^[Ff][Rr]\.?[[:space:]]*', ''));
        IF v_fr ~* '^[0-9]+-?[A-L]$' then    v_fr := regexp_replace(upper(v_fr), '^([0-9]+)-?([A-L])$', '\1-\2');
          END IF;
            NEW.friedberg_number := v_fr;
              RETURN NEW;
              END; $function$
;

CREATE OR REPLACE FUNCTION public.analytics_fr_stubs(days integer DEFAULT 7)
 RETURNS TABLE(fr_number text, first_seen timestamp with time zone, source text, lot_count bigint, sample_title text, est_value numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select c.fr_number, c.imported_at, c.source,
         count(lc.id), max(lc.title), sum(lc.price_realized)
  from catalog_master c
  left join lots_currency lc on lc.fr_canon = c.fr_join_key
  where c.status = 'stub'
    and c.imported_at >= now() - make_interval(days => days)
  group by c.fr_number, c.imported_at, c.source
  order by count(lc.id) desc
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_search_daily(days integer DEFAULT 7)
 RETURNS TABLE(day date, user_email text, is_owner boolean, searches bigint, searches_with_results bigint, zero_result_searches bigint, zero_pct numeric, search_detail text)
 LANGUAGE sql
 STABLE
AS $function$
  select
    s.created_at::date,
    coalesce(p.email, '(anonymous - no profile)'),
    coalesce(p.email = 'johndemartin2@gmail.com', false),
    count(*),
    count(*) filter (where s.result_count > 0),
    count(*) filter (where s.result_count = 0),
    round(100.0 * count(*) filter (where s.result_count = 0) / nullif(count(*),0), 1),
    string_agg(
      case when coalesce(s.title_query,'') <> '' then s.title_query
           else 'filters: ' || s.filters::text end || ' -> ' || s.result_count,
      chr(10) order by s.created_at)
  from public.search_log s
  left join public.profiles p on p.id = s.user_id
  where s.created_at >= current_date - (days || ' days')::interval
  group by 1,2,3
  order by 1 desc, 4 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_suffix_failures(days integer DEFAULT 7)
 RETURNS TABLE(fr_query text, fr_base text, times bigint, distinct_users bigint, friedberg_only boolean, other_filters text, exact_inventory bigint, base_inventory bigint, confidence text, diagnosis text, last_seen timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  with cand as (
    select s.filters->>'friedberg' as raw,
           public.fr_norm(s.filters->>'friedberg') as nrm,
           public.fr_base(s.filters->>'friedberg') as bse,
           (select coalesce(string_agg(k || '=' || (s.filters->>k), ', ' order by k), '')
              from jsonb_object_keys(s.filters) k
             where k not in ('mode','friedberg')) as others,
           coalesce(p.email,'(anon)') as email,
           s.created_at
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    where s.result_count = 0
      and s.created_at >= current_date - (days || ' days')::interval
      and coalesce(s.filters->>'friedberg','') <> ''
  ),
  agg as (
    select raw, nrm, bse, others, count(*) n, count(distinct email) u, max(created_at) ls
    from cand where bse is not null group by 1,2,3,4
  ),
  inv as (
    select public.fr_norm(l.friedberg_number) as nrm,
           public.fr_base(l.friedberg_number) as bse,
           count(*) c
    from public.lots_currency l
    where public.fr_base(l.friedberg_number) in (select bse from agg)
    group by 1,2
  ),
  scored as (
    select a.*,
      coalesce((select sum(i.c) from inv i where i.nrm = a.nrm),0) as exact_c,
      coalesce((select sum(i.c) from inv i where i.bse = a.bse),0) as base_c
    from agg a
  )
  select raw, bse, n, u,
    (others = ''), nullif(others,''),
    exact_c, base_c,
    case
      when others <> '' then 'LOW - co-filtered, zero may be legitimate'
      when exact_c > 0 then 'HIGH'
      else 'MEDIUM'
    end,
    case
      when exact_c > 0 then 'Inventory exists for exact match but search returned 0'
      when base_c > 0 then 'Base has inventory, variant does not'
      else 'No inventory for this Friedberg'
    end,
    ls
  from scored
  order by (others = '') desc, exact_c desc, n desc;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_user_activity(days integer DEFAULT 7)
 RETURNS TABLE(user_email text, tier text, subscription_status text, first_search timestamp with time zone, last_search timestamp with time zone, searches_in_window bigint, days_active bigint, zero_pct numeric, lifetime_searches bigint, cohort text)
 LANGUAGE sql
 STABLE
AS $function$
  with life as (
    select coalesce(p.email,'(anonymous - no profile)') as email,
           max(p.tier) as tier, max(p.subscription_status) as sub,
           min(s.created_at) as first_search, max(s.created_at) as last_search,
           count(*) as lifetime
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    group by 1
  ),
  win as (
    select coalesce(p.email,'(anonymous - no profile)') as email,
           count(*) n, count(distinct s.created_at::date) d,
           round(100.0 * count(*) filter (where s.result_count = 0) / nullif(count(*),0), 1) zpct
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    where s.created_at >= current_date - (days || ' days')::interval
    group by 1
  )
  select l.email, l.tier, l.sub, l.first_search, l.last_search,
         coalesce(w.n,0), coalesce(w.d,0), w.zpct, l.lifetime,
         case
           when l.first_search >= current_date - (days || ' days')::interval then 'new'
           when w.n is null then 'dormant'
           else 'returning'
         end
  from life l left join win w on w.email = l.email
  order by coalesce(w.n,0) desc, l.lifetime desc;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_zero_results(days integer DEFAULT 7)
 RETURNS TABLE(query_kind text, query_text text, times bigint, distinct_users bigint, owner_only boolean, last_seen timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  with z as (
    select s.created_at,
      coalesce(p.email,'(anonymous - no profile)') as email,
      case when coalesce(s.title_query,'') <> '' then 'text' else 'filters' end as kind,
      case when coalesce(s.title_query,'') <> '' then lower(trim(s.title_query))
           else s.filters::text end as qtext
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    where s.result_count = 0
      and s.created_at >= current_date - (days || ' days')::interval
  )
  select kind, qtext, count(*), count(distinct email),
    bool_and(email = 'johndemartin2@gmail.com'), max(created_at)
  from z group by 1,2 order by 3 desc, 6 desc;
$function$
;

CREATE OR REPLACE PROCEDURE public.backfill_raw_grades(IN batch_size integer DEFAULT 2000)
 LANGUAGE plpgsql
AS $procedure$ declare v_updated int; begin loop update lots_currency lc set grade_raw = sub.norm_grade, grading_company = 'raw', grade_numeric = null from ( select id, case when raw_grade ~* '^Superb Gem' then 'Superb Gem Uncirculated' when raw_grade ~* '^Choice[- ]?Gem CU$' then 'Choice Gem Uncirculated' when raw_grade ~* '^Gem (CU|New)$' then 'Gem Uncirculated' when raw_grade ~* '^Choice (CU|New)$' then 'Choice Uncirculated' when raw_grade ~* '^Gem Uncirculated$' then 'Gem Uncirculated' when raw_grade ~* '^Choice Uncirculated$' then 'Choice Uncirculated' when raw_grade ~* '^About Uncirculated$' then 'About Uncirculated' when raw_grade ~* '^Choice About New$' then 'Choice About Uncirculated' when raw_grade ~* '^About New$' then 'About Uncirculated' when raw_grade ~* '^Uncirculated$' then 'Uncirculated' when raw_grade ~* '^AU$' then 'About Uncirculated' when raw_grade ~* '^CU$' then 'Uncirculated' when raw_grade ~* '^Very Fine[- ]Extremely Fine$' then 'Very Fine-Extremely Fine' when raw_grade ~* '^VF[- ]XF$' then 'Very Fine-Extremely Fine' when raw_grade ~* '^Extremely Fine$' then 'Extremely Fine' when raw_grade ~* '^(XF|EF)$' then 'Extremely Fine' when raw_grade ~* '^Choice Fine$' then 'Choice Fine' when raw_grade ~* '^Very Fine$' then 'Very Fine' when raw_grade ~* '^VF\+?$' then 'Very Fine' when raw_grade ~* '^VG[- ]Fine$' then 'Very Good-Fine' when raw_grade ~* '^Good[- ]VG$' then 'Good-Very Good' when raw_grade ~* '^About Good$' then 'About Good' when raw_grade ~* '^Very Good$' then 'Very Good' when raw_grade ~* '^VG$' then 'Very Good' when raw_grade ~* '^Fine$' then 'Fine' when raw_grade ~* '^Good$' then 'Good' else raw_grade end as norm_grade from ( select id, (regexp_match(regexp_replace(title, 'Fr[-. ]?[0-9]+[A-Za-z]?(\*|-[A-Z])?', '', 'gi'), '(\ySuperb Gem New\y|\yChoice[- ]?Gem CU\y|\yGem CU\y|\yGem New\y|\yChoice CU\y|\yChoice New\y|\yChoice Uncirculated\y|\yGem Uncirculated\y|\yAbout Uncirculated\y|\yUncirculated\y|\yChoice About New\y|\yAbout New\y|\yVery Fine[- ]Extremely Fine\y|\yExtremely Fine\y|\yVF[- ]XF\y|\yChoice Fine\y|\yVery Fine\y|\yVG[- ]Fine\y|\yAbout Good\y|\yVery Good\y|\yGood[- ]VG\y|\yFine\y|\yGood\y|\yAU\y|\yXF\y|\yEF\y|\yVF\+?\y|\yVG\y|\yCU\y)'))[1] as raw_grade from lots_currency where grade_raw is null limit batch_size ) m where m.raw_grade is not null ) sub where lc.id = sub.id; get diagnostics v_updated = row_count; raise notice 'batch updated % rows', v_updated; commit; exit when v_updated = 0; end loop; end $procedure$
;

CREATE OR REPLACE FUNCTION public.coin_band_to_est(p_band text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case upper(btrim(p_band))
    when 'P'   then 1
    when 'PO'  then 1
    when 'FR'  then 2
    when 'AG'  then 3
    when 'G'   then 5
    when 'VG'  then 10
    when 'F'   then 15
    when 'VF'  then 30
    when 'XF'  then 45
    when 'EF'  then 45
    when 'AU'  then 55
    when 'UNC' then 62
    when 'MS'  then 62
  end
$function$
;

CREATE OR REPLACE FUNCTION public.coin_grade_band(p_numeric integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_numeric is null then null
    when p_numeric = 1              then 'P'
    when p_numeric = 2              then 'FR'
    when p_numeric = 3              then 'AG'
    when p_numeric between 4  and 7  then 'G'
    when p_numeric between 8  and 11 then 'VG'
    when p_numeric between 12 and 19 then 'F'
    when p_numeric between 20 and 39 then 'VF'
    when p_numeric between 40 and 49 then 'XF'
    when p_numeric between 50 and 59 then 'AU'
    when p_numeric between 60 and 70 then 'UNC'
  end
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_fr_stub()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare v_enabled boolean; v_threshold int; v_window int; v_recent int;
begin
  if NEW.fr_canon is not null
     and not exists (select 1 from catalog_master c where c.fr_join_key = NEW.fr_canon) then
    select coalesce((select value='true' from ingest_guard_config where key='fr_stub_breaker_enabled'), true),
           coalesce((select value::int from ingest_guard_config where key='fr_stub_breaker_threshold'), 100),
           coalesce((select value::int from ingest_guard_config where key='fr_stub_breaker_window_hours'), 24)
      into v_enabled, v_threshold, v_window;
    if v_enabled then
      select count(*) into v_recent from catalog_master
       where status='stub' and source='auto-stub:trigger'
         and imported_at >= now() - make_interval(hours => v_window);
      if v_recent >= v_threshold then
        raise exception 'FR-STUB CIRCUIT BREAKER: % trigger stubs in last %h (threshold %). Ingestion of unknown-Fr lots halted - investigate harvester/catalog before releasing (set fr_stub_breaker_enabled=false or clear stubs). Offending key: %',
          v_recent, v_window, v_threshold, NEW.fr_canon;
      end if;
    end if;
    insert into catalog_master (row_id, fr_number, source, imported_at, status)
    values (nextval('fr_stub_row_id_seq'),
            case when NEW.fr_canon ~ '^[0-9]+[A-Z]+$'
                 then regexp_replace(NEW.fr_canon, '^([0-9]+)([A-Z]+)$', '\1-\2')
                 else NEW.fr_canon end,
            'auto-stub:trigger', now(), 'stub')
    on conflict do nothing;
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.fr_base(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(substring(public.fr_norm(txt) from '^[0-9]+'), '')
$function$
;

CREATE OR REPLACE FUNCTION public.fr_base_canon(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
select nullif(substring(
  regexp_replace(btrim(coalesce(p_raw,'')), '^(fr|f)[.]?[[:space:]]*', '', 'i')
  from '^[0-9]+'), '')
$function$
;

CREATE OR REPLACE FUNCTION public.fr_canon(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
select nullif(
  regexp_replace(
    upper(
      regexp_replace(
        translate(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(btrim(coalesce(p_raw,'')), '^(fr|f)[.]?[[:space:]]*', '', 'i'),
              '[[:space:]]', '', 'g'),
            '([0-9])-([0-9])', '\1~\2', 'g'),
          '-', '', 'g'),
        '~', '-'),
      '[^A-Za-z0-9-]', '', 'g')
    ),
  '^-+|-+$', '', 'g'),
'')
$function$
;

CREATE OR REPLACE FUNCTION public.fr_norm(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(upper(regexp_replace(regexp_replace(coalesce(txt,''), '^\s*[Ff][Rr]\.?\s*', ''), '[^0-9A-Za-z]', '', 'g')), '')
$function$
;

CREATE OR REPLACE FUNCTION public.grade_est_from_text(p_raw text, OUT o_num integer, OUT o_source text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_g text;
  v_lo integer; v_hi integer; v_lo_lab text; v_hi_lab text;
  v_numtok integer; v_detail text;
begin
  o_num := null; o_source := 'none';
  if p_raw is null or btrim(p_raw) = '' then return; end if;

  v_g := public.grade_norm_text(p_raw);
  if v_g = '' then o_source := 'unmapped'; return; end if;

  select m.num, m.source into o_num, o_source
    from public.grade_text_map m where m.g = v_g;
  if found then return; end if;

  if v_g ~ '^(n a|na|any|none|unknown|ungraded|no grade|mixed|various|lot)$' then
    o_num := null; o_source := 'not_a_grade';
  elsif v_g ~ '^(pmg|pcgs banknote|pcgs|cga|sgs|legacy|pr|sp)$' then
    o_num := null; o_source := 'scraper_artifact';
  else
    v_numtok := (regexp_match(v_g,'(^|[^0-9])([0-9]{1,2})([^0-9]|$)'))[2]::int;
    if v_numtok between 1 and 70 then
      o_num := v_numtok; o_source := 'numeric_in_text';
    elsif v_g ~ '\yproof\y' then
      o_num := null; o_source := 'proof';
    else
      with mm as (
        select r.id, r.val, r.label,
               regexp_instr(v_g, r.pattern) as pos,
               length(regexp_substr(v_g, r.pattern)) as len
        from public.grade_text_rules r
        where regexp_instr(v_g, r.pattern) > 0
      ), keep as (
        select mm.* from mm
        where not exists (
          select 1 from mm o
          where o.pos <= mm.pos and o.pos + o.len >= mm.pos + mm.len
            and (o.pos <> mm.pos or o.len <> mm.len)
        )
      )
      select (array_agg(val   order by pos asc,  len desc, id asc))[1],
             (array_agg(val   order by pos desc, len desc, id asc))[1],
             (array_agg(label order by pos asc,  len desc, id asc))[1],
             (array_agg(label order by pos desc, len desc, id asc))[1]
        into v_lo, v_hi, v_lo_lab, v_hi_lab
        from keep;

      if v_hi is null then
        o_num := null; o_source := 'unmapped';
      else
        select l into o_num
          from unnest(array[1,2,3,4,6,8,10,12,15,20,25,30,35,40,45,50,53,55,58,60,62,63,64,65,66,67,68,70]) l
          order by abs(l - (v_lo + v_hi)/2.0), l limit 1;
        o_source := 'text_estimate';
        v_detail := v_lo_lab || case when v_hi_lab = v_lo_lab then '' else ' .. ' || v_hi_lab end;
      end if;
    end if;
  end if;

  if length(v_g) <= 80 then
    begin
      insert into public.grade_text_map(g, num, source, detail)
      values (v_g, o_num, o_source, v_detail)
      on conflict (g) do nothing;
    exception when others then null;
    end;
  end if;
  return;
end
$function$
;

CREATE OR REPLACE FUNCTION public.grade_norm_text(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           lower(left(p_raw, 500)),
           '\(.*?\)',' ','g'),
           '[^a-z0-9]+',' ','g'),
           '\y(to|and|or)\y',' ','g'),
           '\s+',' ','g'))
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.has_entitlement(p_product text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_entitlements e
    where e.user_id = auth.uid()
      and e.product = p_product
      and e.status  = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_ebay_lot(p_source_lot_id text, p_lot_url text, p_title text, p_listing_kind text, p_sold_on date, p_price_realized numeric, p_price_kind text, p_type_class text, p_series_type text, p_series_year integer, p_series_letter text, p_denomination text, p_denomination_raw text, p_friedberg_number text, p_grade_numeric integer, p_grade_raw text, p_grading_company text, p_ppq_epq text, p_is_star_note boolean, p_state_code text, p_charter_number text, p_raw jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_is_sold boolean := (lower(coalesce(p_listing_kind,'')) = 'sold');
BEGIN
  -- ---- REJECT GATE ----
  IF p_source_lot_id IS NULL OR p_source_lot_id = '' THEN
    RAISE EXCEPTION 'reject: source_lot_id missing'; END IF;
  IF p_title IS NULL OR p_title = '' THEN
    RAISE EXCEPTION 'reject: title missing'; END IF;
  IF (p_raw->>'v') IS DISTINCT FROM 'v1' THEN
    RAISE EXCEPTION 'reject: raw.v must be v1'; END IF;
  IF p_series_year IS NULL THEN
    RAISE EXCEPTION 'reject: series_year missing'; END IF;
  IF p_denomination IS NULL OR p_denomination = '' THEN
    RAISE EXCEPTION 'reject: denomination unparseable'; END IF;
  IF p_type_class IS NULL OR p_type_class = '' OR p_type_class = 'other' THEN
    RAISE EXCEPTION 'reject: type_class missing/unclassified'; END IF;
  IF p_grade_numeric IS NULL AND (p_grade_raw IS NULL OR p_grade_raw = '') THEN
    RAISE EXCEPTION 'reject: grade missing'; END IF;
  IF p_grade_numeric IS NOT NULL AND (p_grade_numeric < 1 OR p_grade_numeric > 70) THEN
    RAISE EXCEPTION 'reject: grade_numeric out of range'; END IF;
  IF p_type_class = 'national_bank_note' AND (p_state_code IS NULL OR p_state_code = '') THEN
    RAISE EXCEPTION 'reject: national_bank_note missing state_code'; END IF;
  IF v_is_sold AND p_sold_on IS NULL THEN
    RAISE EXCEPTION 'reject: sold listing missing sold_on'; END IF;
  IF v_is_sold AND p_price_realized IS NULL THEN
    RAISE EXCEPTION 'reject: sold listing missing price_realized'; END IF;

  -- ---- UPSERT (sold_year & friedberg_number_normalized are GENERATED -> never written) ----
  INSERT INTO public.lots_currency (
    source, source_lot_id, lot_url, title,
    sold_on, price_realized, price_kind,
    type_class, series_type, series_year, series_letter,
    denomination, denomination_raw,
    friedberg_number,
    grading_company, grade_raw, grade_numeric, ppq_epq,
    is_star_note, state_code, charter_number,
    data_quality, classified_by, raw, scraped_at, updated_at
  ) VALUES (
    'ebay', p_source_lot_id, p_lot_url, p_title,
    p_sold_on, p_price_realized,
    COALESCE(NULLIF(p_price_kind,''), CASE WHEN v_is_sold THEN 'realized' ELSE 'unknown' END)::price_kind_enum,
    NULLIF(p_type_class,'')::currency_type_class_enum,
    p_series_type, p_series_year, p_series_letter,
    p_denomination, NULLIF(p_denomination_raw,''),
    NULLIF(p_friedberg_number,''),
    COALESCE(NULLIF(p_grading_company,''), 'unknown')::grading_company_enum,
    p_grade_raw, p_grade_numeric,
    COALESCE(NULLIF(p_ppq_epq,''), 'none')::ppq_epq_enum,
    (COALESCE(p_is_star_note, false) OR p_friedberg_number ~ '[*★]' OR p_title ~* '(star|replacement)[[:space:]]+note' OR (p_title ~ '[*★]' AND p_title !~* 'lot of|group| set |examples|consecutive|pack of|\(\d+\)| & ')),
    NULLIF(p_state_code,''), NULLIF(p_charter_number,''),
    'unverified', 'ebay_harvester_v1', p_raw, v_now, v_now
  )
  ON CONFLICT (source, source_lot_id) DO UPDATE SET
    lot_url          = EXCLUDED.lot_url,
    title            = EXCLUDED.title,
    sold_on          = EXCLUDED.sold_on,
    price_realized   = EXCLUDED.price_realized,
    price_kind       = EXCLUDED.price_kind,
    type_class       = EXCLUDED.type_class,
    series_type      = EXCLUDED.series_type,
    series_year      = EXCLUDED.series_year,
    series_letter    = EXCLUDED.series_letter,
    denomination     = EXCLUDED.denomination,
    denomination_raw = EXCLUDED.denomination_raw,
    friedberg_number = COALESCE(EXCLUDED.friedberg_number, lots_currency.friedberg_number),
    state_code       = COALESCE(EXCLUDED.state_code, lots_currency.state_code),
    charter_number   = COALESCE(EXCLUDED.charter_number, lots_currency.charter_number),
    grading_company  = EXCLUDED.grading_company,
    grade_raw        = EXCLUDED.grade_raw,
    grade_numeric    = EXCLUDED.grade_numeric,
    ppq_epq          = EXCLUDED.ppq_epq,
    is_star_note     = EXCLUDED.is_star_note,
    raw              = EXCLUDED.raw,
    updated_at       = v_now,
    data_quality     = 'rescraped';

  RETURN 'ok:' || p_source_lot_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_heritage_coin_lot(p_source_lot_id text, p_lot_url text, p_title text, p_sold_on date, p_price_realized numeric, p_category text, p_denomination text, p_denomination_raw text, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_has_cac boolean, p_has_plus boolean, p_pcgs_number text, p_designation text, p_variety text, p_die_state text, p_rarity text, p_auction_event_id text, p_raw jsonb, p_series_year integer DEFAULT NULL::integer, p_thumbnail_url text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_strike_designation text DEFAULT NULL::text, p_surface_designation text DEFAULT NULL::text, p_strike_type text DEFAULT NULL::text, p_ha_category text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_now timestamptz := now();
v_denom text := NULLIF(p_denomination,'');
v_color text := NULLIF(upper(btrim(p_color)),'');
v_strike text := NULLIF(upper(btrim(p_strike_designation)),'');
v_surface text := NULLIF(upper(btrim(p_surface_designation)),'');
v_legacy text := NULLIF(upper(btrim(p_designation)),'');
v_variety text := NULLIF(btrim(p_variety),'');
v_stype text := NULLIF(upper(btrim(p_strike_type)),'');
v_inserted boolean;
BEGIN
IF p_source_lot_id IS NULL OR p_source_lot_id = '' THEN RAISE EXCEPTION 'reject: source_lot_id missing'; END IF;
IF p_sold_on IS NULL THEN RAISE EXCEPTION 'reject: sold_on missing'; END IF;
IF p_price_realized IS NULL THEN RAISE EXCEPTION 'reject: price_realized missing'; END IF;
IF p_category IS NULL OR p_category = '' THEN RAISE EXCEPTION 'reject: category missing'; END IF;
IF p_grade_raw IS NULL OR p_grade_raw = '' THEN RAISE EXCEPTION 'reject: grade descriptor missing'; END IF;
IF p_grade_numeric IS NOT NULL AND (p_grade_numeric < 1 OR p_grade_numeric > 70) THEN RAISE EXCEPTION 'reject: grade_numeric out of range'; END IF;

-- Normalize incoming strike_type synonyms.
IF v_stype IN ('PR','PF','PROOF') THEN v_stype := 'PROOF';
ELSIF v_stype IN ('SP','SMS','SPECIMEN') THEN v_stype := 'SPECIMEN';
ELSIF v_stype IN ('MS','BIZ','BUSINESS','CIRCULATION') THEN v_stype := 'BUSINESS';
END IF;

-- Rescue strike TYPE values that arrive in the strike DESIGNATION slot (pre-v1.4.4 harvesters).
IF v_strike IN ('PR','PF','PROOF') THEN
v_stype := COALESCE(v_stype,'PROOF'); v_strike := NULL;
ELSIF v_strike IN ('SP','SPECIMEN') THEN
v_stype := COALESCE(v_stype,'SPECIMEN'); v_strike := NULL;
END IF;

-- Heritage designation short codes -> canonical vocabulary. 'ND' means no designation.
IF v_surface IN ('CA','CAMEO') THEN v_surface := 'CAM';
ELSIF v_surface IN ('DC','DCA','DCAMEO') THEN v_surface := 'DCAM';
ELSIF v_surface IN ('DM','DMPL') THEN v_surface := 'DPL';
END IF;
IF v_surface = 'ND' THEN v_surface := NULL; END IF;
IF v_color = 'ND' THEN v_color := NULL; END IF;
IF v_strike = 'ND' THEN v_strike := NULL; END IF;

-- Route a legacy designation into the correct modern column.
IF v_legacy IS NOT NULL THEN
IF v_legacy IN ('PR','PF','PROOF') THEN
v_stype := COALESCE(v_stype,'PROOF');
ELSIF v_legacy IN ('RD','RB','BN') AND v_color IS NULL THEN
v_color := v_legacy;
ELSIF v_legacy IN ('PL','DPL','DMPL','DM','CAM','CA','DCAM','DC','SP') AND v_surface IS NULL THEN
v_surface := CASE v_legacy
WHEN 'DMPL' THEN 'DPL' WHEN 'DM' THEN 'DPL'
WHEN 'CA' THEN 'CAM' WHEN 'DC' THEN 'DCAM'
ELSE v_legacy END;
ELSIF v_legacy IN ('FB','FBL','FH','FT','5FS') AND v_strike IS NULL THEN
v_strike := v_legacy;
ELSIF v_legacy = 'FS' AND v_variety IS NULL THEN
-- 'FS' on a cent is a Fivaz-Stanton variety number, never Full Steps.
v_variety := NULLIF('FS-' || COALESCE(substring(p_title from '(?i)FS[-#]?[[:space:]]?([0-9]{3,4}[A-Za-z]?)'), ''), 'FS-');
END IF;
END IF;

-- Derive strike_type when the harvester did not supply one: certified grade wins, category is fallback.
IF v_stype IS NULL THEN
v_stype := CASE
WHEN p_grade_raw ~* '^[[:space:]]*(PR|PF)' THEN 'PROOF'
WHEN p_grade_raw ~* '^[[:space:]]*SP' THEN 'SPECIMEN'
WHEN p_category ILIKE 'Proof%' THEN 'PROOF'
WHEN p_category ILIKE '%Sms%' THEN 'SPECIMEN'
ELSE 'BUSINESS'
END;
END IF;

-- Controlled vocabulary: reject junk rather than storing it.
IF v_stype NOT IN ('PROOF','BUSINESS','SPECIMEN') THEN RAISE EXCEPTION 'reject: strike_type %', v_stype; END IF;
IF v_color IS NOT NULL AND v_color NOT IN ('RD','RB','BN') THEN RAISE EXCEPTION 'reject: color % not in (RD,RB,BN)', v_color; END IF;
IF v_surface IS NOT NULL AND v_surface NOT IN ('PL','DPL','CAM','DCAM','SP') THEN RAISE EXCEPTION 'reject: surface_designation %', v_surface; END IF;
IF v_strike IS NOT NULL AND v_strike NOT IN ('FS','FB','FBL','FH','FT','5FS') THEN RAISE EXCEPTION 'reject: strike_designation %', v_strike; END IF;

-- Derive denomination from category when the harvester did not supply one.
-- Colonials are intentionally left NULL (mixed denominations; parsed from title by the harvester).
IF v_denom IS NULL THEN
v_denom := CASE
WHEN p_category ~* 'half cent'         THEN '1/2C'
WHEN p_category ~* 'two cent'          THEN '2C'
WHEN p_category ~* 'twenty cent'       THEN '20C'
WHEN p_category ~* 'three cent nickel' THEN '3CN'
WHEN p_category ~* 'three cent silver' THEN '3CS'
WHEN p_category ~* 'three cent'        THEN NULL   -- ambiguous metal, do not guess
WHEN p_category ~* 'colonial'          THEN NULL   -- mixed denominations
WHEN p_category ~* '\mcents?\M'        THEN '1C'
ELSE NULL
END;
END IF;

INSERT INTO public.lots_coins (
source, source_lot_id, lot_url, title, sold_on, price_realized, price_kind,
category, denomination, denomination_raw, grading_company, grade_raw, grade_numeric,
has_cac, has_plus, pcgs_number,
color, strike_designation, surface_designation, strike_type,
variety, die_state, rarity,
auction_event_id, series_year, thumbnail_url, raw, scraped_at, updated_at, ha_category
) VALUES (
'heritage_auctions', p_source_lot_id, p_lot_url, p_title, p_sold_on, p_price_realized, 'realized',
p_category, v_denom, NULLIF(p_denomination_raw,''),
NULLIF(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
COALESCE(p_has_cac,false), COALESCE(p_has_plus,false),
NULLIF(p_pcgs_number,''),
v_color, v_strike, v_surface, v_stype,
v_variety, NULLIF(p_die_state,''), NULLIF(p_rarity,''),
p_auction_event_id, p_series_year, NULLIF(p_thumbnail_url,''), p_raw, v_now, v_now, NULLIF(p_ha_category,'')
)
ON CONFLICT (source, source_lot_id) DO UPDATE SET
lot_url=EXCLUDED.lot_url, title=EXCLUDED.title, sold_on=EXCLUDED.sold_on,
price_realized=EXCLUDED.price_realized, price_kind=EXCLUDED.price_kind,
category=EXCLUDED.category,
ha_category=COALESCE(EXCLUDED.ha_category, lots_coins.ha_category),
denomination=COALESCE(EXCLUDED.denomination, lots_coins.denomination),
denomination_raw=EXCLUDED.denomination_raw,
grading_company=EXCLUDED.grading_company, grade_raw=EXCLUDED.grade_raw, grade_numeric=EXCLUDED.grade_numeric,
has_cac=EXCLUDED.has_cac, has_plus=EXCLUDED.has_plus,
pcgs_number=COALESCE(EXCLUDED.pcgs_number, lots_coins.pcgs_number),
color=COALESCE(EXCLUDED.color, lots_coins.color),
strike_designation=COALESCE(EXCLUDED.strike_designation, lots_coins.strike_designation),
surface_designation=COALESCE(EXCLUDED.surface_designation, lots_coins.surface_designation),
strike_type=COALESCE(EXCLUDED.strike_type, lots_coins.strike_type),
variety=COALESCE(EXCLUDED.variety, lots_coins.variety),
die_state=COALESCE(EXCLUDED.die_state, lots_coins.die_state),
rarity=COALESCE(EXCLUDED.rarity, lots_coins.rarity),
auction_event_id=EXCLUDED.auction_event_id, series_year=EXCLUDED.series_year,
thumbnail_url=COALESCE(EXCLUDED.thumbnail_url, lots_coins.thumbnail_url),
raw=EXCLUDED.raw, updated_at=EXCLUDED.updated_at
RETURNING (xmax = 0) INTO v_inserted;

RETURN (CASE WHEN v_inserted THEN 'ins:' ELSE 'upd:' END) || p_source_lot_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_heritage_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_raw jsonb, p_series_year integer DEFAULT NULL::integer, p_series_letter text DEFAULT NULL::text, p_state_code text DEFAULT NULL::text, p_friedberg_number text DEFAULT NULL::text, p_charter_number text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_inserted boolean;
BEGIN
  IF p_source_lot_id IS NULL OR p_source_lot_id = '' THEN RAISE EXCEPTION 'reject: source_lot_id missing'; END IF;
  IF p_sold_on IS NULL THEN RAISE EXCEPTION 'reject: sold_on missing'; END IF;
  IF p_series_type IS NULL OR p_series_type = '' THEN RAISE EXCEPTION 'reject: series_type missing'; END IF;
  IF p_price_realized IS NULL THEN RAISE EXCEPTION 'reject: price_realized missing'; END IF;
  IF p_denomination IS NULL OR p_denomination = '' THEN RAISE EXCEPTION 'reject: denomination unparseable'; END IF;
  IF (p_raw->>'v') IS DISTINCT FROM 'v8' THEN RAISE EXCEPTION 'reject: raw.v must be v8'; END IF;
  IF p_grade_numeric IS NOT NULL AND (p_grade_numeric < 1 OR p_grade_numeric > 70) THEN RAISE EXCEPTION 'reject: grade_numeric out of range'; END IF;

  INSERT INTO public.lots_currency (
    source, source_lot_id, lot_url, title, series_type, sold_on, price_realized,
    price_kind, denomination, is_star_note, grading_company, grade_raw, grade_numeric,
    auction_event_id, series_year, series_letter, state_code,
    friedberg_number, charter_number, thumbnail_url,
    raw, scraped_at, updated_at
  ) VALUES (
    'heritage_auctions', p_source_lot_id, p_lot_url, p_title, p_series_type, p_sold_on, p_price_realized,
    'realized', p_denomination, COALESCE((COALESCE(p_is_star_note, false) OR COALESCE(p_friedberg_number,'') ~ '[*★]' OR p_title ~* '(star|replacement)[[:space:]]+note' OR (p_title ~ '[*★]' AND p_title !~* 'lot of|group| set |examples|consecutive|pack of|\(\d+\)| & ')), false),
    NULLIF(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
    p_auction_event_id, p_series_year, p_series_letter, NULLIF(p_state_code,''),
    NULLIF(p_friedberg_number,''), NULLIF(p_charter_number,''), NULLIF(p_thumbnail_url,''),
    p_raw, v_now, v_now
  )
  ON CONFLICT (source, source_lot_id) DO UPDATE SET
    lot_url = EXCLUDED.lot_url,
    title = EXCLUDED.title,
    series_type = EXCLUDED.series_type,
    sold_on = EXCLUDED.sold_on,
    price_realized = EXCLUDED.price_realized,
    price_kind = EXCLUDED.price_kind,
    denomination = EXCLUDED.denomination,
    is_star_note = EXCLUDED.is_star_note,
    grading_company = EXCLUDED.grading_company,
    grade_raw = EXCLUDED.grade_raw,
    grade_numeric = EXCLUDED.grade_numeric,
    auction_event_id = EXCLUDED.auction_event_id,
    series_year = EXCLUDED.series_year,
    series_letter = EXCLUDED.series_letter,
    state_code = EXCLUDED.state_code,
    friedberg_number = COALESCE(EXCLUDED.friedberg_number, lots_currency.friedberg_number),
    charter_number   = COALESCE(EXCLUDED.charter_number,   lots_currency.charter_number),
    thumbnail_url    = COALESCE(EXCLUDED.thumbnail_url,    lots_currency.thumbnail_url),
    raw = EXCLUDED.raw,
    updated_at = EXCLUDED.updated_at,
    data_quality = 'rescraped'
  RETURNING (xmax = 0) INTO v_inserted;
  RETURN (CASE WHEN v_inserted THEN 'ins:' ELSE 'upd:' END) || p_source_lot_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_stacks_bowers_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_auction_event_name text, p_friedberg_number text, p_type_class text, p_series_year integer, p_series_letter text, p_state_code text, p_raw jsonb, p_thumbnail_url text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_inserted boolean;
begin
  if p_source_lot_id is null or p_source_lot_id = '' then raise exception 'reject: source_lot_id missing'; end if;
  if p_sold_on is null then raise exception 'reject: sold_on missing'; end if;
  if p_price_realized is null then raise exception 'reject: price_realized missing (unsold or hidden)'; end if;
  if p_grade_numeric is not null and (p_grade_numeric < 1 or p_grade_numeric > 70) then
    raise exception 'reject: grade_numeric out of range'; end if;

  insert into public.lots_currency (
    source, source_lot_id, lot_url, title, sold_on, price_realized, price_kind,
    series_type, type_class, denomination, friedberg_number, is_star_note,
    grading_company, grade_raw, grade_numeric,
    auction_event_id, auction_event_name, series_year, series_letter, state_code,
    thumbnail_url, data_quality, raw, scraped_at, updated_at
  ) values (
    'stacks_bowers', p_source_lot_id, p_lot_url, p_title, p_sold_on, p_price_realized, 'realized',
    p_series_type, nullif(p_type_class,'')::currency_type_class_enum, p_denomination, p_friedberg_number,
    coalesce(
      (coalesce(p_is_star_note, false) or coalesce(p_friedberg_number,'') ~ '[*★]'
        or p_title ~* '(star|replacement)[[:space:]]+note'
        or (p_title ~ '[*★]' and p_title !~* 'lot of|group| set |examples|consecutive|pack of|\(\d+\)| & ')),
      false),
    nullif(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
    p_auction_event_id, p_auction_event_name, p_series_year, p_series_letter, p_state_code,
    nullif(p_thumbnail_url,''), 'trusted', p_raw, now(), now()
  )
  on conflict (source, source_lot_id) do update set
    lot_url=excluded.lot_url, title=excluded.title, sold_on=excluded.sold_on,
    price_realized=excluded.price_realized, series_type=excluded.series_type,
    type_class=excluded.type_class, denomination=excluded.denomination,
    friedberg_number=excluded.friedberg_number, is_star_note=excluded.is_star_note,
    grading_company=excluded.grading_company, grade_raw=excluded.grade_raw,
    grade_numeric=excluded.grade_numeric,
    auction_event_id=coalesce(excluded.auction_event_id, lots_currency.auction_event_id),
    auction_event_name=coalesce(excluded.auction_event_name, lots_currency.auction_event_name),
    thumbnail_url=coalesce(excluded.thumbnail_url, lots_currency.thumbnail_url),
    series_year=excluded.series_year, series_letter=excluded.series_letter, state_code=excluded.state_code,
    raw=excluded.raw, updated_at=now()
  returning (xmax = 0) into v_inserted;

  return (case when v_inserted then 'ins:' else 'upd:' end) || p_source_lot_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$function$
;

CREATE OR REPLACE FUNCTION public.is_paid_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and subscription_status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.lot_search_visible(p_needs_review boolean, p_price numeric, p_sold_on date, p_title text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ select (p_needs_review is not true) or (p_price is not null and p_sold_on is not null and nullif(p_title,'') is not null) $function$
;

CREATE OR REPLACE FUNCTION public.lots_currency_pause_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF current_user IN ('postgres','service_role','supabase_admin') THEN RETURN NEW; END IF; IF NEW.raw IS NULL OR NEW.raw->>'v' IN ('v7.2','v7.3','v7.4') OR NEW.series_type IS NULL OR NEW.sold_on IS NULL THEN RAISE EXCEPTION 'lots_currency writes paused by guard (role=%, v=%, series_type=%, sold_on=%)', current_user, NEW.raw->>'v', NEW.series_type, NEW.sold_on; END IF; RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.normalize_lot_classification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  raw   text := lower(trim(coalesce(NEW.series_type, '')));
  canon text;
  states text[] := ARRAY[
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
    'delaware','district-of-columbia','florida','georgia','hawaii','idaho','illinois',
    'indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts',
    'michigan','minnesota','mississippi','missouri','montana','nebraska','nevada',
    'new-hampshire','new-jersey','new-mexico','new-york','north-carolina','north-dakota',
    'ohio','oklahoma','oregon','pennsylvania','puerto-rico','rhode-island','south-carolina',
    'south-dakota','tennessee','texas','utah','vermont','virginia','washington',
    'west-virginia','wisconsin','wyoming','mixed-states'];
BEGIN
  -- 1) Resolve the canonical series_type label
  IF raw = '' THEN
    canon := NULL;

  ELSIF raw IN ('national-bank-notes','national bank note','national_bank_note','national-bank-note-errors') THEN
    canon := 'National Bank Note';
  ELSIF raw = 'national gold bank note' THEN
    canon := 'National Gold Bank Note';
  ELSIF raw IN ('federal-reserve-notes','federal reserve note','federal_reserve_note','federal-reserve-note') THEN
    canon := 'Federal Reserve Note';
  ELSIF raw IN ('federal-reserve-bank-notes','federal reserve bank note','federal_reserve_bank_note') THEN
    canon := 'Federal Reserve Bank Note';
  ELSIF raw IN ('legal-tender-notes','legal tender note','legal_tender') THEN
    canon := 'Legal Tender Note';
  ELSIF raw IN ('silver-certificates','silver certificate','silver_certificate') THEN
    canon := 'Silver Certificate';
  ELSIF raw IN ('gold-certificates','gold certificate','gold_certificate') THEN
    canon := 'Gold Certificate';
  ELSIF raw IN ('treasury-notes','treasury note','treasury_note','compound-interest-treasury-notes') THEN
    canon := 'Treasury Note';
  ELSIF raw IN ('demand-notes','demand note','demand_note') THEN
    canon := 'Demand Note';
  ELSIF raw IN ('fractional','fractional currency') THEN
    canon := 'Fractional Currency';
  ELSIF raw IN ('confederate','confederate currency') THEN
    canon := 'Confederate Currency';
  ELSIF raw IN ('obsolete','obsolete currency') THEN
    canon := 'Obsolete Currency';
  ELSIF raw IN ('colonial / continental','colonial_continental','continental-currency') THEN
    canon := 'Colonial / Continental Currency';
  ELSIF raw = 'world currency' THEN
    canon := 'World Currency';
  ELSIF raw IN ('world-war-ii-emergency-notes','world war ii emergency notes','world war ii emergency note') THEN
    canon := 'World War II Emergency Note';
  ELSIF raw = 'military payment certificate' THEN
    canon := 'Military Payment Certificate';
  ELSIF raw = 'encased_postage' THEN
    canon := 'Encased Postage';
  ELSIF raw = 'refunding-certificates' THEN
    canon := 'Refunding Certificate';

  -- 2) Special-case rules
  ELSIF raw ~ 'issue[s]?$' THEN                  -- first-issue, 1861-issues, etc.
    canon := 'Fractional Currency';
  ELSIF raw ~ '^series-\d+' THEN                 -- MPC series numbers
    canon := 'Military Payment Certificate';
  ELSIF raw = ANY(states) THEN                   -- state names
    IF coalesce(NEW.title,'') ILIKE '%National Bank%'
       OR coalesce(NEW.title,'') ILIKE '%Charter%'
       OR coalesce(NEW.title,'') ILIKE '%National Currency%' THEN
      canon := 'National Bank Note';
    ELSE
      canon := 'Obsolete Currency';
    END IF;

  -- 3) Already-canonical (idempotent pass-through)
  ELSIF NEW.series_type IN (
     'National Bank Note','Federal Reserve Note','Federal Reserve Bank Note',
     'Legal Tender Note','Silver Certificate','Gold Certificate','Treasury Note',
     'Demand Note','Fractional Currency','Confederate Currency','Obsolete Currency',
     'Colonial / Continental Currency','World Currency','World War II Emergency Note',
     'Military Payment Certificate','Encased Postage','Refunding Certificate',
     'National Gold Bank Note','Other') THEN
    canon := NEW.series_type;

  -- 4) Everything else -> Other
  ELSE
    canon := 'Other';
  END IF;

  NEW.series_type := canon;

  -- 5) Derive type_class from the canonical label
  NEW.type_class := CASE canon
     WHEN 'National Bank Note'              THEN 'national_bank_note'
     WHEN 'National Gold Bank Note'         THEN 'national_bank_note'
     WHEN 'Federal Reserve Note'            THEN 'federal_reserve_note'
     WHEN 'Federal Reserve Bank Note'       THEN 'federal_reserve_bank_note'
     WHEN 'Legal Tender Note'               THEN 'legal_tender'
     WHEN 'Silver Certificate'              THEN 'silver_certificate'
     WHEN 'Gold Certificate'                THEN 'gold_certificate'
     WHEN 'Treasury Note'                   THEN 'treasury_note'
     WHEN 'Demand Note'                     THEN 'demand_note'
     WHEN 'Fractional Currency'             THEN 'fractional'
     WHEN 'Confederate Currency'            THEN 'confederate'
     WHEN 'Obsolete Currency'               THEN 'obsolete'
     WHEN 'Colonial / Continental Currency' THEN 'colonial_continental'
     WHEN 'World Currency'                  THEN 'world_currency'
     WHEN 'Encased Postage'                 THEN 'encased_postage'
     WHEN 'World War II Emergency Note'     THEN 'other'
     WHEN 'Military Payment Certificate'    THEN 'other'
     WHEN 'Refunding Certificate'           THEN 'other'
     WHEN 'Other'                           THEN 'other'
     ELSE NEW.type_class
   END;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_currency_series_counts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_total integer; begin update public.currency_series_counts set n = 0, updated_at = now() where n <> 0; insert into public.currency_series_counts (series_canonical, n, updated_at) select series_canonical, count(*)::bigint, now() from public.lots_currency where series_canonical is not null and search_visible = true and data_quality in ('trusted','rescraped','unverified') group by 1 on conflict (series_canonical) do update set n = excluded.n, updated_at = now(); select count(*) into v_total from public.currency_series_counts where n > 0; return v_total; end; $function$
;

CREATE OR REPLACE FUNCTION public.resolve_lot_from_catalog()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare c_type text; c_denom text; c_year text; c_fr text; is_national boolean;
begin
  is_national := (NEW.charter_number is not null and btrim(NEW.charter_number) <> '')
                 and (NEW.friedberg_number is null or btrim(NEW.friedberg_number) = '');
  if is_national then return NEW; end if;

  -- FR-FIRST, now via unique canonical key (heuristic ORDER BY obsolete post-dedupe)
  if NEW.friedberg_number is not null and btrim(NEW.friedberg_number) <> '' then
    select cm.type, cm.denomination, cm.series_year into c_type, c_denom, c_year
    from public.catalog_master cm
    where cm.fr_join_key = public.fr_canon(NEW.friedberg_number)
    limit 1;
    if found then
      if c_type  is not null then NEW.series_type  := c_type;  end if;
      if c_denom is not null then NEW.denomination := c_denom; end if;
      if c_year ~ '^(1[89]|20)[0-9][0-9]$' then NEW.series_year := c_year::integer; end if;
      return NEW;
    end if;
  end if;

  -- NO FR: triangulate year+denom+type; adopt only if unique
  if NEW.series_year is not null and NEW.series_year::text ~ '^(1[89]|20)[0-9][0-9]$'
     and NEW.denomination is not null and NEW.series_type is not null then
    select t.fr, t.typ, t.den into c_fr, c_type, c_denom
    from (select min(cm.fr_number) as fr, min(cm.type) as typ, min(cm.denomination) as den,
                 count(distinct cm.fr_number) as n
          from public.catalog_master cm
          where cm.series_year = NEW.series_year::text
            and cm.denomination = NEW.denomination
            and cm.type = NEW.series_type) t
    where t.n = 1;
    if found then
      if NEW.friedberg_number is null or btrim(NEW.friedberg_number) = '' then
        NEW.friedberg_number := c_fr;
      end if;
      if c_type  is not null then NEW.series_type  := c_type;  end if;
      if c_denom is not null then NEW.denomination := c_denom; end if;
    end if;
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.review_reason(p_needs_review boolean, p_type_class text, p_title text, p_series_canonical text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ select case when p_needs_review is not true then null when p_type_class = 'world_currency' then 'world_currency' when p_title ~* '\y(coins?|penn(y|ies)|shillings?|kroner?|ducats?|thalers?|drachms?|denarius|denarii|sestertius|medals?|tokens?|gold eagle|half eagle|double eagle)\y' then 'coin_like' when p_type_class is null or p_type_class = 'other' then 'unclassified_type' when p_series_canonical is null then 'unclassified_series' else 'flagged' end $function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_fts_setup()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'cron'
AS $function$
begin
  set local statement_timeout = 0;

  alter table public.lots_currency add column if not exists title_fts tsvector
    generated always as (to_tsvector('simple', coalesce(title,''))) stored;

  create index if not exists idx_lots_currency_title_fts
    on public.lots_currency using gin (title_fts);

  insert into rollback.artifacts (name, kind, content)
  values ('title_fts_added','note','completed at '||now()::text)
  on conflict (name) do update set content = excluded.content;

  -- self-disarm: this job runs exactly once
  perform cron.unschedule('fts-setup-oneshot');
end $function$
;

CREATE OR REPLACE FUNCTION public.search_lots_fuzzy(p_query text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_threshold real DEFAULT 0.3)
 RETURNS TABLE(id bigint, category text, title text, sold_on date, price_realized numeric, grade_raw text, lot_url text, thumbnail_url text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  select * from public.search_lots_v2(p_query, p_category, p_limit, p_threshold);
$function$
;

CREATE OR REPLACE FUNCTION public.search_lots_v2(p_query text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_threshold real DEFAULT 0.3)
 RETURNS TABLE(id bigint, category text, title text, sold_on date, price_realized numeric, grade_raw text, lot_url text, thumbnail_url text, rank real)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_q text := btrim(coalesce(p_query,''));
  v_key text; v_tsq tsquery; v_tsq_fixed tsquery;
  v_lim int := greatest(1, least(p_limit, 200));
  v_n int := 0; v_fixed text;
begin
  if p_category = 'coins' then
    return query
      select l.id, l.category::text, l.title, l.sold_on, l.price_realized, l.grade_raw, l.lot_url, l.thumbnail_url,
             word_similarity(v_q, l.title) as rank
      from lots_all l
      where l.category::text='coins' and l.title is not null
        and (v_q % l.title or l.title ilike '%'||v_q||'%')
        and word_similarity(v_q, l.title) >= p_threshold
      order by rank desc, l.price_realized desc nulls last limit v_lim;
    return;
  end if;

  v_key := public.search_lots_v2_keyparse(v_q);
  v_tsq := websearch_to_tsquery('simple', v_q);

  if v_key is not null then
    return query
      select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url, 2.0::real
      from lots_currency lc
      where lc.search_visible and (lc.fr_canon = v_key or lc.fr_base_canon = v_key)
      order by lc.sold_on desc nulls last limit v_lim;
    get diagnostics v_n = row_count;
    if v_n > 0 then return; end if;
  end if;

  if v_tsq is not null then
    return query
      select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url,
             (1.0 + ts_rank(lc.title_fts, v_tsq))::real
      from lots_currency lc
      where lc.search_visible and lc.title_fts @@ v_tsq
      order by ts_rank(lc.title_fts, v_tsq) desc, lc.sold_on desc nulls last limit v_lim;
    get diagnostics v_n = row_count;
    if v_n > 0 then return; end if;
  end if;

  select string_agg(coalesce(fix.word, tok.t), ' ') into v_fixed
  from unnest(regexp_split_to_array(lower(regexp_replace(v_q,'[^a-z0-9 ]',' ','gi')),'\s+')) with ordinality tok(t, ord)
  left join lateral (
    select w.word from title_word_freq w
    where length(tok.t) >= 4 and w.word % tok.t
      and not exists (select 1 from title_word_freq e where e.word = tok.t)
    order by similarity(w.word, tok.t) * ln(w.n + 1) desc limit 1
  ) fix on true
  where tok.t <> '';
  if v_fixed is not null and lower(v_fixed) <> lower(v_q) then
    v_tsq_fixed := websearch_to_tsquery('simple', v_fixed);
    return query
      select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url,
             (0.5 + ts_rank(lc.title_fts, v_tsq_fixed))::real
      from lots_currency lc
      where lc.search_visible and lc.title_fts @@ v_tsq_fixed
      order by ts_rank(lc.title_fts, v_tsq_fixed) desc, lc.sold_on desc nulls last limit v_lim;
    get diagnostics v_n = row_count;
    if v_n > 0 then return; end if;
  end if;

  return query
    select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url,
           word_similarity(v_q, lc.title) as rank
    from lots_currency lc
    where lc.search_visible and lc.title is not null
      and (v_q % lc.title or lc.title ilike '%'||v_q||'%')
      and word_similarity(v_q, lc.title) >= p_threshold
    order by rank desc, lc.price_realized desc nulls last limit v_lim;
end $function$
;

CREATE OR REPLACE FUNCTION public.search_lots_v2_keyparse(p_q text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when c ~* '^(fr\.?)?([0-9]{2,4}([a-z]|exp|sp(wm|nm)?[fb]?)?|t[0-9]{1,3}|ep[0-9]{1,3}[a-z]?)\*?$'
    then public.fr_canon(regexp_replace(c, '\*$', ''))
    else null end
  from (select regexp_replace(regexp_replace(lower(btrim(p_q)), 'exper\w*$', 'exp'), '[\s.-]+', '', 'g') as c) t
$function$
;

CREATE OR REPLACE FUNCTION public.set_fr_canon()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_src text; v_base text; v_multi int;
begin
  v_src := case when nullif(NEW.friedberg_number,'') is not null then NEW.friedberg_number
                when nullif(NEW.catalog_number,'') is not null
                     and NEW.catalog_number is distinct from NEW.charter_number
                then NEW.catalog_number
                else null end;

  v_multi := coalesce(array_length(array(
    select distinct m[1]
    from regexp_matches(coalesce(NEW.title,''),'Fr[.][[:space:]]*([0-9]{3,4})[A-Za-z*]*[[:space:]]*[$]','gi') as m
  ),1),0);

  if v_multi >= 2 then
    NEW.is_multi_fr_lot := true; NEW.fr_canon := null; NEW.fr_base_canon := null;
    return NEW;
  end if;

  NEW.is_multi_fr_lot := false;
  v_base := public.fr_base_canon(v_src);

  if v_base in ('1601','1602','1607')
     and public.fr_canon(v_src) !~ 'EXP$'
     and (
       (coalesce(NEW.title,'') ilike '%experiment%'
        and coalesce(NEW.denomination,'') ~ '(^|[^0-9])1($|[^0-9])'
        and (coalesce(NEW.series_type,'') ilike '%silver%' or coalesce(NEW.series_canonical,'') ilike '%silver%'))
       or (v_base in ('1601','1602') and coalesce(NEW.title,'') ~* '\m[XYZ][- ]?B\M')
       or (v_base = '1607'           and coalesce(NEW.title,'') ~* '\m[ABC][- ]?B\M')
     ) then
    v_src := regexp_replace(v_src, '[-]?[Ee]$', '') || 'exp';
  end if;

  NEW.fr_canon := public.fr_canon(v_src);
  NEW.fr_base_canon := public.fr_base_canon(v_src);
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_grade_numeric_est()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare r record;
begin
  if new.grade_numeric is not null then
    new.grade_numeric_est := new.grade_numeric;
    new.grade_grade_source := 'certified';
  elsif new.grade_raw is null or btrim(new.grade_raw) = '' then
    new.grade_numeric_est := null;
    new.grade_grade_source := 'none';
  else
    select * into r from public.grade_est_from_text(new.grade_raw);
    new.grade_numeric_est := r.o_num;
    new.grade_grade_source := r.o_source;
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.set_lincoln_denom()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin if NEW.category='Lincoln Cents' and (NEW.denomination_raw is null or btrim(NEW.denomination_raw)='') then NEW.denomination_raw:='1C'; end if; return NEW; end; $function$
;

CREATE OR REPLACE FUNCTION public.set_review_flags()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$ begin new.review_reason := public.review_reason(new.needs_review, new.type_class::text, new.title, new.series_canonical); new.search_visible := public.lot_search_visible(new.needs_review, new.price_realized, new.sold_on, new.title); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.suggest_title_terms(p_term text, p_limit integer DEFAULT 3)
 RETURNS TABLE(suggestion text, score real, n bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select word, similarity(word, lower(p_term)) as score, n
  from title_word_freq
  where similarity(word, lower(p_term)) > 0.35
  order by score desc, n desc
  limit p_limit
$function$
;

CREATE OR REPLACE FUNCTION public.title_matches(title text, query text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ select word_similarity(query, title) >= 0.3 $function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end $function$
;

create or replace view public.census_summary as
 SELECT census_type,
    lookup_key,
    denomination,
    denomination_raw,
    note_type,
    series,
    description,
    fed_signature,
    bank_signature,
    state_code,
    city,
    bank_name,
    total_population,
    regular_count,
    star_count,
    large_note_count,
    small_note_count,
    graded_count,
    top_grade,
    grade_distribution,
    grader_distribution,
    type_distribution,
    denomination_distribution,
    fr_canon(lookup_key) AS fr_canon,
    fr_base_canon(lookup_key) AS fr_base_canon
   FROM ( SELECT 'large'::text AS census_type,
            large_fr_catalog.fr_number AS lookup_key,
            large_fr_catalog.denomination::numeric AS denomination,
            large_fr_catalog.denomination_raw,
            large_fr_catalog.note_type,
            large_fr_catalog.series,
            large_fr_catalog.description,
            large_fr_catalog.fed_signature,
            large_fr_catalog.bank_signature,
            NULL::text AS state_code,
            NULL::text AS city,
            NULL::text AS bank_name,
            large_fr_catalog.total_population,
            large_fr_catalog.regular_count,
            large_fr_catalog.star_count,
            NULL::integer AS large_note_count,
            NULL::integer AS small_note_count,
            large_fr_catalog.graded_count,
            large_fr_catalog.top_grade,
            large_fr_catalog.grade_distribution,
            large_fr_catalog.grader_distribution,
            NULL::jsonb AS type_distribution,
            NULL::jsonb AS denomination_distribution
           FROM large_fr_catalog
        UNION ALL
         SELECT 'small'::text AS census_type,
            small_fr_catalog.fr_number AS lookup_key,
            small_fr_catalog.denomination,
            small_fr_catalog.denomination_raw,
            small_fr_catalog.note_type,
            small_fr_catalog.series,
            small_fr_catalog.description,
            small_fr_catalog.fed_signature,
            small_fr_catalog.bank_signature,
            NULL::text AS state_code,
            NULL::text AS city,
            NULL::text AS bank_name,
            small_fr_catalog.total_population,
            small_fr_catalog.regular_count,
            small_fr_catalog.star_count,
            NULL::integer AS large_note_count,
            NULL::integer AS small_note_count,
            small_fr_catalog.graded_count,
            small_fr_catalog.top_grade,
            small_fr_catalog.grade_distribution,
            small_fr_catalog.grader_distribution,
            NULL::jsonb AS type_distribution,
            NULL::jsonb AS denomination_distribution
           FROM small_fr_catalog
        UNION ALL
         SELECT 'national'::text AS census_type,
            national_charter_catalog.charter_number AS lookup_key,
            NULL::numeric AS denomination,
            NULL::text AS denomination_raw,
            NULL::text AS note_type,
            NULL::text AS series,
            NULL::text AS description,
            NULL::text AS fed_signature,
            NULL::text AS bank_signature,
            national_charter_catalog.state_code,
            national_charter_catalog.city,
            national_charter_catalog.bank_name,
            national_charter_catalog.total_population,
            NULL::integer AS regular_count,
            NULL::integer AS star_count,
            national_charter_catalog.large_note_count,
            national_charter_catalog.small_note_count,
            national_charter_catalog.graded_count,
            national_charter_catalog.top_grade,
            national_charter_catalog.grade_distribution,
            national_charter_catalog.grader_distribution,
            national_charter_catalog.type_distribution,
            national_charter_catalog.denomination_distribution
           FROM national_charter_catalog) s;

create or replace view public.friedberg_catalog as
 SELECT row_id,
    fr_number,
    fr_key,
    size_category,
    type,
    denomination,
    denomination_value,
    series_year,
    signatures,
    seal,
    district,
    districts_letters,
    city_location,
    bank,
    bank_signatures,
    type_variant,
    notes,
    source,
    imported_at,
    status,
    fr_join_key,
    catalog_system
   FROM catalog_master;

create or replace view public.harvest_reconciliation as
 WITH landed AS (
         SELECT c.ha_category,
            c.category,
            c.denomination,
            c.series_year,
                CASE
                    WHEN c.strike_designation = ANY (ARRAY['FB'::text, 'FBL'::text, 'FT'::text, 'FH'::text, 'FS'::text]) THEN c.strike_designation
                    WHEN c.strike_designation = ANY (ARRAY['5FS'::text, '5F'::text]) THEN '5F'::text
                    WHEN c.surface_designation = 'CAM'::text THEN 'CA'::text
                    WHEN c.surface_designation = 'DCAM'::text THEN 'DC'::text
                    WHEN c.surface_designation = 'PL'::text THEN 'PL'::text
                    WHEN c.color = ANY (ARRAY['RD'::text, 'RB'::text, 'BN'::text]) THEN c.color
                    ELSE 'ND'::text
                END AS ha_desig,
            count(*) AS landed_n,
            max(c.scraped_at) AS last_scraped_at
           FROM lots_coins c
          GROUP BY c.ha_category, c.category, c.denomination, c.series_year, (
                CASE
                    WHEN c.strike_designation = ANY (ARRAY['FB'::text, 'FBL'::text, 'FT'::text, 'FH'::text, 'FS'::text]) THEN c.strike_designation
                    WHEN c.strike_designation = ANY (ARRAY['5FS'::text, '5F'::text]) THEN '5F'::text
                    WHEN c.surface_designation = 'CAM'::text THEN 'CA'::text
                    WHEN c.surface_designation = 'DCAM'::text THEN 'DC'::text
                    WHEN c.surface_designation = 'PL'::text THEN 'PL'::text
                    WHEN c.color = ANY (ARRAY['RD'::text, 'RB'::text, 'BN'::text]) THEN c.color
                    ELSE 'ND'::text
                END)
        )
 SELECT e.category,
    e.denomination,
    e.series_year,
    e.ha_desig,
    e.expected_n,
    COALESCE(sum(l.landed_n), 0::numeric) AS landed_n,
    COALESCE(sum(l.landed_n), 0::numeric) - e.expected_n::numeric AS delta,
    max(l.last_scraped_at) AS last_scraped_at
   FROM harvest_expectations e
     LEFT JOIN landed l ON l.series_year = e.series_year AND l.ha_desig = e.ha_desig AND (e.denomination = '*'::text OR l.denomination = e.denomination) AND
        CASE
            WHEN e.category ~ '^[0-9]+$'::text THEN l.ha_category
            ELSE l.category
        END = e.category
  WHERE e.source = 'heritage'::text
  GROUP BY e.category, e.denomination, e.series_year, e.ha_desig, e.expected_n;

create or replace view public.harvest_reconciliation_by_year as
 WITH exp AS (
         SELECT harvest_reconciliation.category,
            harvest_reconciliation.denomination,
            harvest_reconciliation.series_year,
            sum(harvest_reconciliation.expected_n) AS expected_n,
            max(harvest_reconciliation.last_scraped_at) AS last_scraped_at
           FROM harvest_reconciliation
          GROUP BY harvest_reconciliation.category, harvest_reconciliation.denomination, harvest_reconciliation.series_year
        ), act AS (
         SELECT lots_coins.ha_category AS category,
            lots_coins.series_year,
            count(*)::numeric AS landed_n
           FROM lots_coins
          GROUP BY lots_coins.ha_category, lots_coins.series_year
        )
 SELECT e.category,
    e.denomination,
    e.series_year,
    e.expected_n,
    COALESCE(a.landed_n, 0::numeric) AS landed_n,
    COALESCE(a.landed_n, 0::numeric) - e.expected_n::numeric AS delta,
    round(100.0 * COALESCE(a.landed_n, 0::numeric) / NULLIF(e.expected_n, 0)::numeric, 1) AS pct,
        CASE
            WHEN COALESCE(a.landed_n, 0::numeric) >= e.expected_n::numeric THEN 'ok'::text
            WHEN COALESCE(a.landed_n, 0::numeric) = 0::numeric THEN 'not_started'::text
            WHEN (COALESCE(a.landed_n, 0::numeric) / NULLIF(e.expected_n, 0)::numeric) >= 0.98 THEN 'near'::text
            WHEN (COALESCE(a.landed_n, 0::numeric) / NULLIF(e.expected_n, 0)::numeric) < 0.10 THEN 'pending'::text
            ELSE 'short'::text
        END AS status,
    e.last_scraped_at
   FROM exp e
     LEFT JOIN act a ON a.category = e.category AND a.series_year = e.series_year;

create or replace view public.lots_all as
 SELECT 'currency'::category_enum AS category,
    lots_currency.id,
    lots_currency.source,
    lots_currency.source_lot_id,
    lots_currency.lot_url,
    lots_currency.title,
    lots_currency.sold_on,
    lots_currency.sold_year,
    lots_currency.price_realized,
    lots_currency.price_kind,
    lots_currency.currency_code,
    lots_currency.grading_company,
    lots_currency.grade_raw,
    lots_currency.grade_numeric,
    lots_currency.auction_event_id,
    lots_currency.auction_event_name,
    lots_currency.thumbnail_url,
    lots_currency.scraped_at,
    lots_currency.updated_at
   FROM lots_currency
UNION ALL
 SELECT 'coins'::category_enum AS category,
    lots_coins.id,
    lots_coins.source,
    lots_coins.source_lot_id,
    lots_coins.lot_url,
    lots_coins.title,
    lots_coins.sold_on,
    lots_coins.sold_year,
    lots_coins.price_realized,
    lots_coins.price_kind,
    lots_coins.currency_code,
    lots_coins.grading_company,
    lots_coins.grade_raw,
    lots_coins.grade_numeric,
    lots_coins.auction_event_id,
    lots_coins.auction_event_name,
    lots_coins.thumbnail_url,
    lots_coins.scraped_at,
    lots_coins.updated_at
   FROM lots_coins;

create or replace view public.lots_coins_resolved as
 SELECT id,
    source,
    source_lot_id,
    lot_url,
    title,
    sold_on,
    sold_year,
    price_realized,
    price_kind,
    price_estimate_low,
    price_estimate_high,
    currency_code,
    series_year,
    denomination,
    denomination_raw,
    variety,
    die_state,
    rarity,
    grading_company,
    grade_raw,
    grade_numeric,
    has_cac,
    has_plus,
    pcgs_number,
    designation,
    auction_event_id,
    auction_event_name,
    thumbnail_url,
    raw,
    scraped_at,
    updated_at,
    category,
    color,
    strike_designation,
    surface_designation,
    grade_display,
    strike_type,
    ha_category
   FROM lots_coins l
  WHERE ( SELECT has_entitlement('coins'::text) AS has_entitlement);

create or replace view public.lots_currency_resolved as
 SELECT lc.id,
    lc.source,
    lc.source_lot_id,
    lc.lot_url,
    lc.title,
    lc.sold_on,
    lc.sold_year,
    lc.price_realized,
    lc.price_kind,
    lc.price_estimate_low,
    lc.price_estimate_high,
    lc.currency_code,
    lc.type_class,
    lc.series_date,
    lc.series_type,
    lc.denomination,
    lc.denomination_raw,
    lc.friedberg_number,
    lc.grading_company,
    lc.grade_raw,
    lc.grade_numeric,
    lc.ppq_epq,
    lc.serial_number,
    lc.signatures,
    lc.is_star_note,
    lc.auction_event_id,
    lc.auction_event_name,
    lc.thumbnail_url,
    lc.raw,
    lc.scraped_at,
    lc.updated_at,
    lc.state_code,
    lc.charter_number,
    lc.data_quality,
    lc.series_year,
    lc.series_letter,
    lc.classified_by,
    lc.catalog_number,
    lc.catalog_system,
    lc.catalog_source,
    lc.friedberg_base,
    lc.series_canonical,
    lc.needs_review,
    lc.denomination_canonical,
    lc.is_mixed_denomination,
    lc.grade_numeric_est,
    lc.grade_grade_source,
    lc.fr_canon,
    lc.fr_base_canon,
    lc.review_reason,
    lc.search_visible,
    lc.is_multi_fr_lot,
    lc.friedberg_number_normalized,
    COALESCE(lc.grade_numeric, lc.grade_numeric_est) AS grade_numeric_search,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.friedberg_number
            ELSE COALESCE(cat.fr_number, lc.friedberg_number, lc.catalog_number)
        END AS display_fr,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.series_year::text
            ELSE COALESCE(NULLIF(cat.series_year, ''::text), lc.series_year::text)
        END AS display_year,
    COALESCE(lc.denomination_canonical,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.denomination
            ELSE COALESCE(cat.denomination, lc.denomination)
        END) AS display_denom,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.series_type
            ELSE COALESCE(cat.type, lc.series_type)
        END AS display_type,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN NULL::text
            ELSE cat.districts_letters
        END AS display_district,
    COALESCE(NULLIF(lc.signatures, ''::text), cat.signatures) AS display_signatures,
    cat.seal AS display_seal
   FROM lots_currency lc
     LEFT JOIN catalog_master cat ON cat.fr_join_key = lc.fr_canon;

create materialized view public.title_word_freq as
 SELECT word,
    count(*) AS n
   FROM ( SELECT regexp_replace(lower(unnest(regexp_split_to_array(lots_currency_resolved.title, '\s+'::text))), '[^a-z0-9]+'::text, ''::text, 'g'::text) AS word
           FROM lots_currency_resolved
          WHERE lots_currency_resolved.title IS NOT NULL) w
  WHERE length(word) >= 3
  GROUP BY word; with no data;

create or replace view public.v_coin_business_mintages as
 SELECT t.coin_name,
    t.denomination,
    m.year,
    m.mint,
    m.mintmark,
    m.variety,
    m.mintage,
    m.notes
   FROM coin_mintages m
     JOIN coin_types t USING (type_id)
  WHERE m.strike_type = 'Business'::coin_strike_type
  ORDER BY t.coin_name, m.year, m.mint;

CREATE TRIGGER lots_coins_set_lincoln_denom BEFORE INSERT OR UPDATE ON public.lots_coins FOR EACH ROW EXECUTE FUNCTION set_lincoln_denom();

CREATE TRIGGER lots_coins_touch_updated_at BEFORE UPDATE ON public.lots_coins FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_normalize_lot_classification BEFORE INSERT OR UPDATE OF series_type, title ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION normalize_lot_classification();

CREATE TRIGGER lots_currency_touch_updated_at BEFORE UPDATE ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER lots_currency_pause_guard_trg BEFORE INSERT OR UPDATE ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION lots_currency_pause_guard();

CREATE TRIGGER zz_resolve_lot_from_catalog BEFORE INSERT OR UPDATE ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION resolve_lot_from_catalog();

CREATE TRIGGER aaa_normalize_fr_number_trg BEFORE INSERT OR UPDATE ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION aaa_normalize_fr_number();

CREATE TRIGGER aaa_normalize_denomination_cents_trg BEFORE INSERT OR UPDATE ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION aaa_normalize_denomination_cents();

CREATE TRIGGER zzz_grade_est_trg BEFORE INSERT OR UPDATE OF grade_raw, grade_numeric ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION set_grade_numeric_est();

CREATE TRIGGER zzz_fr_canon_trg BEFORE INSERT OR UPDATE ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION set_fr_canon();

CREATE TRIGGER zzz_review_flags_trg BEFORE INSERT OR UPDATE ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION set_review_flags();

CREATE TRIGGER zzzz_fr_stub_trg BEFORE INSERT OR UPDATE OF friedberg_number, catalog_number, charter_number, title ON public.lots_currency FOR EACH ROW EXECUTE FUNCTION ensure_fr_stub();

grant EXECUTE on function public.aaa_normalize_denomination_cents() to anon;

grant EXECUTE on function public.aaa_normalize_denomination_cents() to authenticated;

grant EXECUTE on function public.aaa_normalize_denomination_cents() to service_role;

grant EXECUTE on function public.aaa_normalize_fr_number() to authenticated;

grant EXECUTE on function public.aaa_normalize_fr_number() to service_role;

grant EXECUTE on function public.aaa_normalize_fr_number() to anon;

grant EXECUTE on function public.analytics_fr_stubs(days integer) to authenticated;

grant EXECUTE on function public.analytics_fr_stubs(days integer) to anon;

grant EXECUTE on function public.analytics_fr_stubs(days integer) to service_role;

grant EXECUTE on function public.analytics_search_daily(days integer) to anon;

grant EXECUTE on function public.analytics_search_daily(days integer) to service_role;

grant EXECUTE on function public.analytics_search_daily(days integer) to authenticated;

grant EXECUTE on function public.analytics_suffix_failures(days integer) to service_role;

grant EXECUTE on function public.analytics_suffix_failures(days integer) to authenticated;

grant EXECUTE on function public.analytics_suffix_failures(days integer) to anon;

grant EXECUTE on function public.analytics_user_activity(days integer) to authenticated;

grant EXECUTE on function public.analytics_user_activity(days integer) to service_role;

grant EXECUTE on function public.analytics_user_activity(days integer) to anon;

grant EXECUTE on function public.analytics_zero_results(days integer) to service_role;

grant EXECUTE on function public.analytics_zero_results(days integer) to anon;

grant EXECUTE on function public.analytics_zero_results(days integer) to authenticated;

grant EXECUTE on function public.backfill_raw_grades(IN batch_size integer) to anon;

grant EXECUTE on function public.backfill_raw_grades(IN batch_size integer) to authenticated;

grant EXECUTE on function public.backfill_raw_grades(IN batch_size integer) to service_role;

grant EXECUTE on function public.coin_band_to_est(p_band text) to authenticated;

grant EXECUTE on function public.coin_band_to_est(p_band text) to anon;

grant EXECUTE on function public.coin_band_to_est(p_band text) to service_role;

grant EXECUTE on function public.coin_grade_band(p_numeric integer) to anon;

grant EXECUTE on function public.coin_grade_band(p_numeric integer) to service_role;

grant EXECUTE on function public.coin_grade_band(p_numeric integer) to authenticated;

grant EXECUTE on function public.ensure_fr_stub() to authenticated;

grant EXECUTE on function public.ensure_fr_stub() to anon;

grant EXECUTE on function public.ensure_fr_stub() to service_role;

grant EXECUTE on function public.fr_base(txt text) to anon;

grant EXECUTE on function public.fr_base(txt text) to service_role;

grant EXECUTE on function public.fr_base(txt text) to authenticated;

grant EXECUTE on function public.fr_base_canon(p_raw text) to anon;

grant EXECUTE on function public.fr_base_canon(p_raw text) to service_role;

grant EXECUTE on function public.fr_base_canon(p_raw text) to authenticated;

grant EXECUTE on function public.fr_canon(p_raw text) to anon;

grant EXECUTE on function public.fr_canon(p_raw text) to service_role;

grant EXECUTE on function public.fr_canon(p_raw text) to authenticated;

grant EXECUTE on function public.fr_norm(txt text) to authenticated;

grant EXECUTE on function public.fr_norm(txt text) to anon;

grant EXECUTE on function public.fr_norm(txt text) to service_role;

grant EXECUTE on function public.grade_est_from_text(p_raw text, OUT o_num integer, OUT o_source text) to authenticated;

grant EXECUTE on function public.grade_est_from_text(p_raw text, OUT o_num integer, OUT o_source text) to service_role;

grant EXECUTE on function public.grade_est_from_text(p_raw text, OUT o_num integer, OUT o_source text) to anon;

grant EXECUTE on function public.grade_norm_text(p_raw text) to authenticated;

grant EXECUTE on function public.grade_norm_text(p_raw text) to anon;

grant EXECUTE on function public.grade_norm_text(p_raw text) to service_role;

grant EXECUTE on function public.handle_new_user() to service_role;

grant EXECUTE on function public.handle_new_user() to authenticated;

grant EXECUTE on function public.handle_new_user() to anon;

grant EXECUTE on function public.has_entitlement(p_product text) to anon;

grant EXECUTE on function public.has_entitlement(p_product text) to service_role;

grant EXECUTE on function public.has_entitlement(p_product text) to authenticated;

grant EXECUTE on function public.ingest_ebay_lot(p_source_lot_id text, p_lot_url text, p_title text, p_listing_kind text, p_sold_on date, p_price_realized numeric, p_price_kind text, p_type_class text, p_series_type text, p_series_year integer, p_series_letter text, p_denomination text, p_denomination_raw text, p_friedberg_number text, p_grade_numeric integer, p_grade_raw text, p_grading_company text, p_ppq_epq text, p_is_star_note boolean, p_state_code text, p_charter_number text, p_raw jsonb) to service_role;

grant EXECUTE on function public.ingest_ebay_lot(p_source_lot_id text, p_lot_url text, p_title text, p_listing_kind text, p_sold_on date, p_price_realized numeric, p_price_kind text, p_type_class text, p_series_type text, p_series_year integer, p_series_letter text, p_denomination text, p_denomination_raw text, p_friedberg_number text, p_grade_numeric integer, p_grade_raw text, p_grading_company text, p_ppq_epq text, p_is_star_note boolean, p_state_code text, p_charter_number text, p_raw jsonb) to anon;

grant EXECUTE on function public.ingest_ebay_lot(p_source_lot_id text, p_lot_url text, p_title text, p_listing_kind text, p_sold_on date, p_price_realized numeric, p_price_kind text, p_type_class text, p_series_type text, p_series_year integer, p_series_letter text, p_denomination text, p_denomination_raw text, p_friedberg_number text, p_grade_numeric integer, p_grade_raw text, p_grading_company text, p_ppq_epq text, p_is_star_note boolean, p_state_code text, p_charter_number text, p_raw jsonb) to authenticated;

grant EXECUTE on function public.ingest_heritage_coin_lot(p_source_lot_id text, p_lot_url text, p_title text, p_sold_on date, p_price_realized numeric, p_category text, p_denomination text, p_denomination_raw text, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_has_cac boolean, p_has_plus boolean, p_pcgs_number text, p_designation text, p_variety text, p_die_state text, p_rarity text, p_auction_event_id text, p_raw jsonb, p_series_year integer, p_thumbnail_url text, p_color text, p_strike_designation text, p_surface_designation text, p_strike_type text, p_ha_category text) to service_role;

grant EXECUTE on function public.ingest_heritage_coin_lot(p_source_lot_id text, p_lot_url text, p_title text, p_sold_on date, p_price_realized numeric, p_category text, p_denomination text, p_denomination_raw text, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_has_cac boolean, p_has_plus boolean, p_pcgs_number text, p_designation text, p_variety text, p_die_state text, p_rarity text, p_auction_event_id text, p_raw jsonb, p_series_year integer, p_thumbnail_url text, p_color text, p_strike_designation text, p_surface_designation text, p_strike_type text, p_ha_category text) to anon;

grant EXECUTE on function public.ingest_heritage_coin_lot(p_source_lot_id text, p_lot_url text, p_title text, p_sold_on date, p_price_realized numeric, p_category text, p_denomination text, p_denomination_raw text, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_has_cac boolean, p_has_plus boolean, p_pcgs_number text, p_designation text, p_variety text, p_die_state text, p_rarity text, p_auction_event_id text, p_raw jsonb, p_series_year integer, p_thumbnail_url text, p_color text, p_strike_designation text, p_surface_designation text, p_strike_type text, p_ha_category text) to authenticated;

grant EXECUTE on function public.ingest_heritage_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_raw jsonb, p_series_year integer, p_series_letter text, p_state_code text, p_friedberg_number text, p_charter_number text, p_thumbnail_url text) to authenticated;

grant EXECUTE on function public.ingest_heritage_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_raw jsonb, p_series_year integer, p_series_letter text, p_state_code text, p_friedberg_number text, p_charter_number text, p_thumbnail_url text) to service_role;

grant EXECUTE on function public.ingest_heritage_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_raw jsonb, p_series_year integer, p_series_letter text, p_state_code text, p_friedberg_number text, p_charter_number text, p_thumbnail_url text) to anon;

grant EXECUTE on function public.ingest_stacks_bowers_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_auction_event_name text, p_friedberg_number text, p_type_class text, p_series_year integer, p_series_letter text, p_state_code text, p_raw jsonb, p_thumbnail_url text) to anon;

grant EXECUTE on function public.ingest_stacks_bowers_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_auction_event_name text, p_friedberg_number text, p_type_class text, p_series_year integer, p_series_letter text, p_state_code text, p_raw jsonb, p_thumbnail_url text) to service_role;

grant EXECUTE on function public.ingest_stacks_bowers_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_auction_event_name text, p_friedberg_number text, p_type_class text, p_series_year integer, p_series_letter text, p_state_code text, p_raw jsonb, p_thumbnail_url text) to authenticated;

grant EXECUTE on function public.is_admin() to anon;

grant EXECUTE on function public.is_admin() to service_role;

grant EXECUTE on function public.is_admin() to authenticated;

grant EXECUTE on function public.is_paid_member() to anon;

grant EXECUTE on function public.is_paid_member() to service_role;

grant EXECUTE on function public.is_paid_member() to authenticated;

grant EXECUTE on function public.lot_search_visible(p_needs_review boolean, p_price numeric, p_sold_on date, p_title text) to anon;

grant EXECUTE on function public.lot_search_visible(p_needs_review boolean, p_price numeric, p_sold_on date, p_title text) to service_role;

grant EXECUTE on function public.lot_search_visible(p_needs_review boolean, p_price numeric, p_sold_on date, p_title text) to authenticated;

grant EXECUTE on function public.lots_currency_pause_guard() to anon;

grant EXECUTE on function public.lots_currency_pause_guard() to authenticated;

grant EXECUTE on function public.lots_currency_pause_guard() to service_role;

grant EXECUTE on function public.normalize_lot_classification() to service_role;

grant EXECUTE on function public.normalize_lot_classification() to anon;

grant EXECUTE on function public.normalize_lot_classification() to authenticated;

grant EXECUTE on function public.refresh_currency_series_counts() to service_role;

grant EXECUTE on function public.resolve_lot_from_catalog() to service_role;

grant EXECUTE on function public.resolve_lot_from_catalog() to anon;

grant EXECUTE on function public.resolve_lot_from_catalog() to authenticated;

grant EXECUTE on function public.review_reason(p_needs_review boolean, p_type_class text, p_title text, p_series_canonical text) to anon;

grant EXECUTE on function public.review_reason(p_needs_review boolean, p_type_class text, p_title text, p_series_canonical text) to service_role;

grant EXECUTE on function public.review_reason(p_needs_review boolean, p_type_class text, p_title text, p_series_canonical text) to authenticated;

grant EXECUTE on function public.rls_auto_enable() to service_role;

grant EXECUTE on function public.rls_auto_enable() to authenticated;

grant EXECUTE on function public.rls_auto_enable() to anon;

grant EXECUTE on function public.run_fts_setup() to anon;

grant EXECUTE on function public.run_fts_setup() to authenticated;

grant EXECUTE on function public.run_fts_setup() to service_role;

grant EXECUTE on function public.search_lots_fuzzy(p_query text, p_category text, p_limit integer, p_threshold real) to anon;

grant EXECUTE on function public.search_lots_fuzzy(p_query text, p_category text, p_limit integer, p_threshold real) to authenticated;

grant EXECUTE on function public.search_lots_fuzzy(p_query text, p_category text, p_limit integer, p_threshold real) to service_role;

grant EXECUTE on function public.search_lots_v2(p_query text, p_category text, p_limit integer, p_threshold real) to anon;

grant EXECUTE on function public.search_lots_v2(p_query text, p_category text, p_limit integer, p_threshold real) to authenticated;

grant EXECUTE on function public.search_lots_v2(p_query text, p_category text, p_limit integer, p_threshold real) to service_role;

grant EXECUTE on function public.search_lots_v2_keyparse(p_q text) to anon;

grant EXECUTE on function public.search_lots_v2_keyparse(p_q text) to authenticated;

grant EXECUTE on function public.search_lots_v2_keyparse(p_q text) to service_role;

grant EXECUTE on function public.set_fr_canon() to anon;

grant EXECUTE on function public.set_fr_canon() to authenticated;

grant EXECUTE on function public.set_fr_canon() to service_role;

grant EXECUTE on function public.set_grade_numeric_est() to service_role;

grant EXECUTE on function public.set_grade_numeric_est() to anon;

grant EXECUTE on function public.set_grade_numeric_est() to authenticated;

grant EXECUTE on function public.set_lincoln_denom() to service_role;

grant EXECUTE on function public.set_lincoln_denom() to anon;

grant EXECUTE on function public.set_lincoln_denom() to authenticated;

grant EXECUTE on function public.set_review_flags() to service_role;

grant EXECUTE on function public.set_review_flags() to authenticated;

grant EXECUTE on function public.set_review_flags() to anon;

grant EXECUTE on function public.suggest_title_terms(p_term text, p_limit integer) to anon;

grant EXECUTE on function public.suggest_title_terms(p_term text, p_limit integer) to authenticated;

grant EXECUTE on function public.suggest_title_terms(p_term text, p_limit integer) to service_role;

grant EXECUTE on function public.title_matches(title text, query text) to service_role;

grant EXECUTE on function public.title_matches(title text, query text) to authenticated;

grant EXECUTE on function public.title_matches(title text, query text) to anon;

grant EXECUTE on function public.touch_updated_at() to service_role;

grant EXECUTE on function public.touch_updated_at() to anon;

grant EXECUTE on function public.touch_updated_at() to authenticated;