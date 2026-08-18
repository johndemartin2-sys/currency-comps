-- =====================================================================
-- 20260818e  (APPLIED to live 2026-08-18)
-- Historical backfill of lots_currency.series_year / series_letter,
-- evolved from sql/PROPOSED_backfill_series_year_letter.sql with two
-- upgrades learned since it was drafted:
--   1. catalog references are STRIPPED from the title before the
--      lettered-token match (mirrors the harvester SHARED CORE), so
--      "Fr. 1935D" can never feed the year slot;
--   2. candidates are cross-checked against v_census_series - where the
--      census disagrees with the title, the census wins (95.4% agreed;
--      the 1,679 disagreements were mostly changeover pairs like
--      "1934/1934A" where the only lettered token belongs to the OTHER
--      note in the pair).
--
-- Candidate rules (conservative, unchanged from the proposal):
--   exactly ONE distinct lettered-year token in the stripped title,
--   letter A-H only, not is_multi_fr_lot.
--
-- As-run results:
--   candidates                42,526   (0 implausible years)
--   census-judgeable          36,765   (95.4% title/census agreement)
--   year=Fr# corruption      30,987 -> 4,419  (residual lacks a clean
--                                     lettered token to correct from)
--   impossible years            989 -> 848
--   "1935D $1 invert" search  BASE TABLE now returns 13 (was 0)
--
-- ORDERING NOTE: 20260818b MUST run first. The first attempt ran
-- against the old resolve_lot_from_catalog trigger, which silently
-- overwrote 24,486 of the 42,526 writes with untrusted catalog values.
--
-- Backup: bak_series_yl_20260818 (42,526 rows: id, series_year,
-- series_letter). Rollback: update from backup by id.
-- =====================================================================

create or replace view public.v_series_yl_candidates_v2 as
with m as (
  select
    lc.id, lc.title, lc.series_year, lc.series_letter,
    lc.fr_canon, lc.fr_base_canon, lc.is_multi_fr_lot,
    (
      select array_agg(distinct x[1] || x[2])
      from regexp_matches(
        regexp_replace(
          regexp_replace(lc.title,
            '(Fr|Friedberg)\.?\s*#?\s*[0-9]{1,4}[A-Za-z]*\*?(-[A-Za-z0-9]{1,5})?\*?', ' ', 'gi'),
          '\y(W|T|EP)\.?\s*-?\s*[0-9]{1,5}[A-Za-z]?\y', ' ', 'g'),
        '(?<![0-9])(1[89][0-9]{2}|20[0-2][0-9])([A-H])(?![A-Za-z0-9])',
        'g'
      ) as x
    ) as toks
  from public.lots_currency lc
)
select
  id, title,
  series_year   as old_year,
  series_letter as old_letter,
  fr_canon, fr_base_canon,
  left(toks[1], 4)::int as new_year,
  right(toks[1], 1)     as new_letter,
  case
    when series_year::text = fr_base_canon then 'year_was_fr_number'
    when series_year is null               then 'year_was_null'
    when series_year::text <> left(toks[1], 4) then 'year_mismatch'
    else 'year_ok'
  end as year_reason,
  case
    when series_letter is null              then 'letter_was_null'
    when series_letter <> right(toks[1], 1) then 'letter_mismatch'
    else 'letter_ok'
  end as letter_reason
from m
where array_length(toks, 1) = 1
  and coalesce(is_multi_fr_lot, false) = false
  and (series_year is distinct from left(toks[1], 4)::int
       or series_letter is distinct from right(toks[1], 1));

-- Materialize candidates with their census verdict (as-run this was
-- tmp_backfill_cand_20260818), back up, then write:
--
-- create table tmp_backfill_cand as
-- select c.*, v.series_designation as census_series
-- from public.v_series_yl_candidates_v2 c
-- left join v_census_series v on v.fr_join_key = c.fr_canon;
--
-- create table public.bak_series_yl_20260818 as
-- select lc.id, lc.series_year, lc.series_letter
-- from public.lots_currency lc join tmp_backfill_cand c on c.id = lc.id;
--
-- update public.lots_currency lc
--    set series_year = case when c.census_series is not null
--                           then left(c.census_series,4)::int
--                           else c.new_year end,
--        series_letter = case when c.census_series is not null
--                             then nullif(substr(c.census_series,5,1),'')
--                             else c.new_letter end,
--        updated_at = now()
--   from tmp_backfill_cand c
--  where lc.id = c.id;

-- ---------------------------------------------------------------------
-- Also in this batch: spurious-charter cleanup. 16 lots classified
-- "National Bank Note" carried a real charter number but were national
-- bank EPHEMERA (checks, stamped covers, stock certificates, loan
-- agreements, scrip) -> series_type 'Other' (15 lots), plus one genuine
-- $20 Type 1 NBN (Tully NY, Ch.5746) whose year 1998 -> 1929.
-- Backup: bak_spurious_charter_20260818. The remaining ~75 lots of the
-- old "~480 implausible nationals" were already correctly classified
-- Other/Obsolete; their years are genuine document dates.
-- ---------------------------------------------------------------------
