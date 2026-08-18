-- =====================================================================
-- 20260817_year_series_catalog.sql
--
-- APPLIED TO PRODUCTION 2026-08-17 as three migrations:
--     catalog_series_designation_schema
--     lots_currency_resolved_display_year_series
--     lots_currency_resolved_national_series_guard
--
-- This file is the consolidated record of what is live.
--
-- THE BUG. Searching "1935D" in Year/Series returned zero results.
-- currency_app.html was correct all along - it queries
--     display_year.ilike.1935D%
-- The view could not answer. lots_currency_resolved.display_year was built
-- from catalog_master.series_year (bare 4-digit text) falling back to
-- lots_currency.series_year (integer). Neither can hold a series letter, so
-- every lettered year returned nothing. All 10,417 rows with series_year=1935
-- had display_year exactly '1935'.
--
-- The lettered series already existed in small_fr_catalog / large_fr_catalog
-- (series column: Fr.1613, 1613N, 1613W all -> '1935D'). The app never read it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. catalog_master gains a lettered series column
-- ---------------------------------------------------------------------
alter table public.catalog_master
  add column if not exists series_designation text,
  add column if not exists series_source      text,
  add column if not exists series_denom_check text,
  add column if not exists trust_rank         smallint;

comment on column public.catalog_master.series_designation is
  'Lettered series designation, e.g. 1935D. Populated from small_fr_catalog / '
  'large_fr_catalog via public.v_census_series.';
comment on column public.catalog_master.series_denom_check is
  'Denomination as recorded by the CENSUS, e.g. $10. Used only by the G2 guard. '
  'Deliberately not catalog_master.denomination, which is merged from '
  'mixed-quality sources and inconsistently formatted ($1,000 vs $1000).';
comment on column public.catalog_master.trust_rank is
  '1=census, 2=curated, 3=derived/majority-vote, 9=stub.';

-- ---------------------------------------------------------------------
-- 2. G3 - overrides / quarantine
--
-- The census is not immune to the same district-letter bug found in the lots.
-- In the modern $5 FRN family the DISTRICT letter was appended to the series:
-- Fr. 1999D recorded as series '2021D'. There is no Series 2021D.
-- 2021I / 2021K / 2021L also carry a suffix past H, structurally impossible.
--
-- NULL series_designation = QUARANTINE: do not import, leave blank.
--
-- DO NOT add a blanket "series suffix equals district letter" rule. 176 census
-- rows match that shape and 165 are legitimate - Fr. 1941A is district A and
-- Series 2017A, which is real. Only the family below is genuine corruption.
-- ---------------------------------------------------------------------
create table if not exists public.catalog_series_overrides (
  fr_join_key        text primary key,
  series_designation text,
  reason             text not null,
  created_at         timestamptz not null default now()
);

insert into public.catalog_series_overrides (fr_join_key, series_designation, reason) values
  ('1999A','2021','census appended district letter: recorded 2021A'),
  ('1999B','2021','census appended district letter: recorded 2021B'),
  ('1999D','2021','census appended district letter: recorded 2021D'),
  ('1999E','2021','census appended district letter: recorded 2021E'),
  ('1999F','2021','census appended district letter: recorded 2021F'),
  ('1999G','2021','census appended district letter: recorded 2021A on district G'),
  ('1999H','2021','census appended district letter: recorded 2021H'),
  ('1999I','2021','census appended district letter: recorded 2021I (suffix past H)'),
  ('1999K','2021','census appended district letter: recorded 2021K (suffix past H)'),
  ('1999L','2021','census appended district letter: recorded 2021L (suffix past H)'),
  ('1976AL', null ,'census records series 1982; no $5 Series 1982 exists. Quarantined.')
on conflict (fr_join_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. G1 + G3 - validated census source, one row per exact fr_canon key
-- ---------------------------------------------------------------------
create or replace view public.v_census_series as
with raw as (
  select fr_number, series, denomination::text as denomination, note_type
    from public.small_fr_catalog
  union all
  select fr_number, series, denomination::text, note_type
    from public.large_fr_catalog
),
gated as (
  select
    public.fr_canon(r.fr_number) as fr_join_key,
    coalesce(o.series_designation, r.series) as series,
    r.denomination,
    r.note_type,
    (o.fr_join_key is not null) as was_overridden
  from raw r
  left join public.catalog_series_overrides o
         on o.fr_join_key = public.fr_canon(r.fr_number)
  where public.fr_canon(r.fr_number) is not null
    and not (o.fr_join_key is not null and o.series_designation is null)
    -- A-H is the real range. I-L are Federal Reserve district letters,
    -- never series designations. Admitting them caused the original bug.
    and coalesce(o.series_designation, r.series) ~ '^[0-9]{4}[A-H]?$'
    and left(coalesce(o.series_designation, r.series), 4)::int between 1690 and 2030
)
select
  fr_join_key,
  min(series)             as series_designation,
  min(denomination)       as census_denomination,
  min(note_type)          as census_note_type,
  bool_or(was_overridden) as was_overridden
from gated
group by fr_join_key
having count(distinct series) = 1;   -- ambiguous keys dropped, never guessed

-- ---------------------------------------------------------------------
-- 4. Populate. Precedence: census > curated > majority-vote > stub.
-- series_year is never modified, so nothing reading it changes behaviour.
-- ---------------------------------------------------------------------
update public.catalog_master cm
set trust_rank = case
      when cm.status in ('stub','invalid')  then 9
      when cm.source = 'lots_majority_vote' then 3
      else 2 end
where cm.trust_rank is null;

update public.catalog_master cm
set series_designation = v.series_designation,
    series_source      = 'census',
    series_denom_check = case when v.census_denomination ~ '^[0-9]+$'
                              then '$' || v.census_denomination end,
    trust_rank         = 1
from public.v_census_series v
where v.fr_join_key = cm.fr_join_key;

update public.catalog_master cm
set series_designation = cm.series_year,
    series_source      = case when cm.source = 'lots_majority_vote'
                              then 'majority_vote' else 'curated' end
where cm.series_designation is null
  and cm.series_year ~ '^[0-9]{4}$'
  and cm.status not in ('stub','invalid');

-- RE-APPLY THE QUARANTINE. Do not skip. The step above fills from
-- catalog_master.series_year, which for a quarantined key still holds the bad
-- value the quarantine existed to reject - Fr. 1976A-L carries '1982' and was
-- silently re-filled with it on the first run.
update public.catalog_master cm
set series_designation = null,
    series_source      = 'quarantined',
    series_denom_check = null
from public.catalog_series_overrides o
where o.fr_join_key = cm.fr_join_key
  and o.series_designation is null;

-- ---------------------------------------------------------------------
-- 5. Nationals: Fr. 1800-1804 -> Series 1929
--
-- These are the $5/$10/$20/$50/$100 Series 1929 nationals. They had NO year
-- in catalog_master, so display_year fell through to lc.series_year - which
-- for these lots holds the FRIEDBERG NUMBER. Rows showed "Fr. 1801-1" and
-- "Year 1801" side by side. Title evidence across 7,875 lots: 7,637 say 1929,
-- 2 say anything else. The `type` predicate keeps the six auto-stub rows out.
-- ---------------------------------------------------------------------
update public.catalog_master
set series_designation = '1929',
    series_source      = 'national_1929',
    trust_rank         = least(coalesce(trust_rank, 2), 2)
where fr_join_key ~ '^180[0-4]'
  and type = 'National Bank Notes'
  and series_designation is null;

-- ---------------------------------------------------------------------
-- 6. The view. Four guards:
--   G1  exact fr_canon join, never the Friedberg base (0 conflicts vs 21)
--   G2  denomination guard - never show a catalog series that contradicts
--       the lot's own denomination (923 lots)
--   G3  census validation gate (above)
--   G4  national plausibility guard - a National Bank Note may only show a
--       real national series. Gated on series_canonical, NOT on the mere
--       presence of a charter number: 36 Gold Certificates, Silver
--       Certificates, FRNs, Legal Tenders, FRBNs and WWII notes carry a
--       spuriously-parsed charter and would otherwise have been wiped.
--
-- The raw value is computed once in a LATERAL so the guard can test it
-- without repeating the expression, and the ::int cast lives inside a CASE
-- so it never evaluates on a non-numeric value.
-- ---------------------------------------------------------------------
create or replace view public.lots_currency_resolved as
 SELECT lc.id,
    lc.source, lc.source_lot_id, lc.lot_url, lc.title, lc.sold_on, lc.sold_year,
    lc.price_realized, lc.price_kind, lc.price_estimate_low, lc.price_estimate_high,
    lc.currency_code, lc.type_class, lc.series_date, lc.series_type, lc.denomination,
    lc.denomination_raw, lc.friedberg_number, lc.grading_company, lc.grade_raw,
    lc.grade_numeric, lc.ppq_epq, lc.serial_number, lc.signatures, lc.is_star_note,
    lc.auction_event_id, lc.auction_event_name, lc.thumbnail_url, lc.raw,
    lc.scraped_at, lc.updated_at, lc.state_code, lc.charter_number, lc.data_quality,
    lc.series_year, lc.series_letter, lc.classified_by, lc.catalog_number,
    lc.catalog_system, lc.catalog_source, lc.friedberg_base, lc.series_canonical,
    lc.needs_review, lc.denomination_canonical, lc.is_mixed_denomination,
    lc.grade_numeric_est, lc.grade_grade_source, lc.fr_canon, lc.fr_base_canon,
    lc.review_reason, lc.search_visible, lc.is_multi_fr_lot,
    lc.friedberg_number_normalized,
    COALESCE(lc.grade_numeric, lc.grade_numeric_est) AS grade_numeric_search,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.friedberg_number
            ELSE COALESCE(cat.fr_number, lc.friedberg_number, lc.catalog_number)
        END AS display_fr,
    CASE WHEN g.is_national AND d.dy IS NOT NULL AND NOT g.ok THEN NULL::text
         ELSE d.dy END AS display_year,
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
    cat.seal AS display_seal,
    CASE WHEN g.is_national AND d.dy IS NOT NULL AND NOT g.ok
         THEN 'suppressed_not_a_national_series'::text
         ELSE d.dsrc END AS display_year_source
   FROM lots_currency lc
     LEFT JOIN catalog_master cat ON cat.fr_join_key = lc.fr_canon
     CROSS JOIN LATERAL (
       SELECT
         CASE
           WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text
                AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text)
             THEN lc.series_year::text
           WHEN cat.series_designation IS NOT NULL
                AND lc.denomination_canonical IS NOT NULL
                AND cat.series_denom_check IS NOT NULL
                AND lc.denomination_canonical <> cat.series_denom_check
             THEN NULL::text
           WHEN cat.series_designation IS NOT NULL THEN cat.series_designation
           ELSE COALESCE(NULLIF(cat.series_year, ''::text), lc.series_year::text)
         END AS dy,
         CASE
           WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text
                AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN 'national'::text
           WHEN cat.series_designation IS NOT NULL
                AND lc.denomination_canonical IS NOT NULL
                AND cat.series_denom_check IS NOT NULL
                AND lc.denomination_canonical <> cat.series_denom_check THEN 'suppressed_denom_conflict'::text
           WHEN cat.series_designation IS NOT NULL THEN cat.series_source
           ELSE 'legacy'::text
         END AS dsrc
     ) d
     CROSS JOIN LATERAL (
       SELECT
         (COALESCE(lc.series_canonical,'') = 'National Bank Note'
          AND COALESCE(lc.charter_number,'') <> '') AS is_national,
         CASE WHEN d.dy ~ '^[0-9]{4}$'
              THEN (d.dy::int BETWEEN 1863 AND 1875 OR d.dy::int IN (1882,1902,1929))
              ELSE false END AS ok
     ) g;


-- =====================================================================
-- MEASURED RESULTS, full population (703,153 rows)
--
--   1935D . $1 . "invert" ......      0 ->     13
--   1935D . $1 (all) ...........      0 ->  1,109
--   1934B . $50 . FRN ..........      0 ->    114
--   plain 1935 . $1 ........... 11,579 -> 12,311
--   nationals with a year ..... 169,513 -> 169,513  (unchanged)
--   display_year NULL ........ 101,737 -> 102,807
--
-- Full diff: 624,243 unchanged | 923 value->blank (exactly G2) |
--            77,987 changed - 55,310 gained a letter, 22,677 year corrections
-- Those 22,677 checked against the series stated in the titles, full
-- population: 17,900 of 17,947 verifiable favour the new value, 39 the old.
--
-- Nationals: Fr#-as-year 0 remaining | implausible national years 0 remaining
--            7,868 lots gained Series 1929 | 335 G4 suppressions
--
-- Six real searches replayed from search_log returned their exact prior
-- counts: 13 | 114 | 1 | 53 | 2078 | 19
--
-- display_year_source distribution (sums to 703,153):
--   census 267,924 | legacy 213,477 | curated 107,402 | national 77,474
--   majority_vote 27,750 | national_1929 7,868
--   suppressed_denom_conflict 923 | suppressed_not_a_national_series 335
--
-- Backups: bak_catalog_master_20260817, bak_catalog_master_20260817b,
--          bak_viewdef_20260817
--
-- STILL OUTSTANDING
--   * Stack's Bowers harvester - 3,084 corrupt rows, a DIFFERENT variant of
--     the bug. Only source emitting series letters past E and years in the
--     1600s, neither of which the Heritage regex can produce.
--   * Heritage harvester v9.4.0 - written and validated, not yet installed.
--   * Server-side reject guard on the three ingest RPCs:
--       IF p_series_year::text = public.fr_base_canon(p_friedberg_number)
--       THEN RAISE EXCEPTION 'reject: series_year equals friedberg number';
--   * 42,548 historical lots_currency.series_year / series_letter values.
--     Off the critical path now that the catalog drives display.
--   * Eight disputed Friedberg numbers. Fr. 823 is the one to check:
--     catalog says 1915, all 15 titles say 1918.
-- =====================================================================
