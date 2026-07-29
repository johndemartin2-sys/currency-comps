-- =============================================================================
-- 05_harvest_reconciliation.sql
-- Project : Comp Tool v1.0  (Supabase project wqizwluccqqfkedpgvve)
-- Author  : generated during the v1.4.4 harvester audit
--
-- PURPOSE
--   Answer the question the harvester never asked itself: "did we actually get
--   the whole run?"
--
-- BACKGROUND
--   coin-harvester.user.js (v1.4.4) builds a FIXED queue of slices at sweep
--   start. A slice is one (series_year x Heritage color/surface facet) pair,
--   and Heritage reports a result count n for it. The harvester walks that
--   queue by integer index i, pages each slice 50 rows at a time from page 1
--   to ceil(n/50), then increments i. There is no per-slice reconciliation and
--   no retry queue: if a pass is interrupted or a page errors, the shortfall is
--   silent. These objects make it loud.
--
--     harvest_expectations            <- what Heritage said each slice holds
--     harvest_reconciliation          <- per-slice expected vs landed (DIAGNOSTIC)
--     harvest_reconciliation_by_year  <- per-year rollup (THE SIGNAL TO TRUST)
--
-- READ THE PER-YEAR VIEW, NOT THE PER-SLICE VIEW, when deciding to re-sweep.
--   Slice buckets on the landed side are *inferred* from lots_coins.color and
--   lots_coins.surface_designation. A cameo proof whose title yields a color
--   lands in RD, not CA; a lot whose surface code was rejected lands in ND.
--   So per-slice deltas are useful for diagnosing WHY a year is short, but
--   only year totals are reliable for deciding WHETHER it is short.
--
-- A SMALL POSITIVE DELTA IS NORMAL. lots_coins also holds same-denomination
--   lots harvested from other Heritage categories, so the pass criterion is
--   landed_n >= expected_n, not equality.
--
-- PROVENANCE OF THE SEED
--   The 113 expected counts below were read out of the live sweep queue
--   (localStorage['chq14'].slices) on the harvester tab. Checksum:
--   sum(expected_n) = 55342, which matches the runtime queue total exactly.
--   Re-seed this table whenever the sweep queue is rebuilt with new facets or
--   a different year range.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Expectations: the source site's own claimed result count per slice
-- -----------------------------------------------------------------------------
create table if not exists public.harvest_expectations (
  id           bigserial   primary key,
  source       text        not null default 'heritage',
  category     text,                    -- HA coin_category id, e.g. '3862' (Small Cents)
  denomination text,                    -- normalized denom, e.g. '1C'
  series_year  int         not null,
  ha_desig     text        not null,    -- HA short code: RD RB BN ND CA DC PL
  expected_n   int         not null,    -- result count Heritage reported for the slice
  captured_at  timestamptz not null default now(),
  constraint harvest_expectations_uniq
    unique (source, category, denomination, series_year, ha_desig)
);

comment on table public.harvest_expectations is
  'Per-slice result counts reported by the source site (Heritage) at sweep-build time. One row per (series_year, ha_desig) facet pair. Seeded from the live harvester queue localStorage[chq14].slices. Re-seed whenever the sweep queue is rebuilt.';

alter table public.harvest_expectations enable row level security;
revoke all on public.harvest_expectations from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. Seed: 113 slices, 1931-1958 Lincoln cents, sum(expected_n) = 55342
--    Idempotent: re-running refreshes expected_n and captured_at.
-- -----------------------------------------------------------------------------
insert into public.harvest_expectations
  (source, category, denomination, series_year, ha_desig, expected_n)
select 'heritage', '3862', '1C', v.year, v.desig, v.n
from (values
  (1931, 'RD', 1751),
  (1931, 'RB',  937),
  (1931, 'BN', 1740),

  (1932, 'RD',  900),
  (1932, 'RB',   43),
  (1932, 'BN',    3),

  (1933, 'RD', 1142),
  (1933, 'RB',   35),
  (1933, 'BN',    6),

  (1934, 'RD', 1184),
  (1934, 'RB',   35),
  (1934, 'BN',    6),

  (1935, 'RD', 1471),
  (1935, 'RB',   23),
  (1935, 'BN',    5),

  (1936, 'RD', 1971),
  (1936, 'RB',  271),
  (1936, 'BN',  170),
  (1936, 'CA',   28),

  (1937, 'RD', 2594),
  (1937, 'RB',  109),
  (1937, 'BN',   20),
  (1937, 'CA',   92),
  (1937, 'DC',    8),

  (1938, 'RD', 2302),
  (1938, 'RB',  112),
  (1938, 'BN',   18),
  (1938, 'CA',   68),

  (1939, 'RD', 2832),
  (1939, 'RB',   78),
  (1939, 'BN',   16),
  (1939, 'CA',    8),

  (1940, 'RD', 2509),
  (1940, 'RB',   73),
  (1940, 'BN',    6),
  (1940, 'CA',    9),

  (1941, 'RD', 2153),
  (1941, 'RB',  128),
  (1941, 'BN',   52),
  (1941, 'PL',    2),

  (1942, 'RD', 2421),
  (1942, 'RB',  150),
  (1942, 'BN',   23),
  (1942, 'CA',   99),
  (1942, 'DC',    8),

  (1943, 'BN',   22),
  (1943, 'ND', 3486),
  (1943, 'PL',    8),

  (1944, 'RD', 2093),
  (1944, 'RB',   70),
  (1944, 'BN',  166),
  (1944, 'ND',   25),

  (1945, 'RD', 1992),
  (1945, 'RB',    7),
  (1945, 'BN',    4),

  (1946, 'RD', 1235),
  (1946, 'RB',   10),
  (1946, 'BN',    4),

  (1947, 'RD', 1134),
  (1947, 'RB',    5),
  (1947, 'BN',    5),

  (1948, 'RD', 1031),
  (1948, 'RB',    5),
  (1948, 'BN',    1),

  (1949, 'RD', 1014),
  (1949, 'RB',    7),
  (1949, 'BN',    4),

  (1950, 'RD', 1143),
  (1950, 'RB',   14),
  (1950, 'BN',    4),
  (1950, 'CA',  162),
  (1950, 'DC',  107),

  (1951, 'RD', 1213),
  (1951, 'RB',   16),
  (1951, 'BN',   10),
  (1951, 'CA',   65),
  (1951, 'DC',    2),

  (1952, 'RD', 1233),
  (1952, 'RB',   10),
  (1952, 'BN',    2),
  (1952, 'CA',  110),
  (1952, 'DC',    7),

  (1953, 'RD', 1391),
  (1953, 'RB',    7),
  (1953, 'BN',    5),
  (1953, 'CA',  127),
  (1953, 'DC',   51),

  (1954, 'RD', 2122),
  (1954, 'RB',   14),
  (1954, 'BN',    4),
  (1954, 'CA',   93),
  (1954, 'DC',   46),

  (1955, 'RD', 2063),
  (1955, 'RB',  305),
  (1955, 'BN', 1554),
  (1955, 'CA',   81),
  (1955, 'DC',   60),

  (1956, 'RD', 1086),
  (1956, 'RB',   27),
  (1956, 'BN',   24),
  (1956, 'CA',   93),
  (1956, 'DC',   85),

  (1957, 'RD',  701),
  (1957, 'RB',   38),
  (1957, 'BN',   16),
  (1957, 'ND',    1),
  (1957, 'CA',  116),
  (1957, 'DC',   32),

  (1958, 'RD',  990),
  (1958, 'RB',    6),
  (1958, 'BN',    2),
  (1958, 'CA',  110),
  (1958, 'DC',   55)
) as v(year, desig, n)
on conflict on constraint harvest_expectations_uniq
do update set expected_n  = excluded.expected_n,
              captured_at = now();


-- -----------------------------------------------------------------------------
-- 3. Per-slice reconciliation (DIAGNOSTIC ONLY -- see header warning)
--
--    The bucket CASE below reverse-engineers the HA facet from what we stored.
--    Precedence is surface first, then color, else ND:
--      CAM  -> CA      DCAM -> DC      PL -> PL
--      color RD/RB/BN  -> itself
--      anything else   -> ND
--    A rejected or missing surface code therefore *moves* a lot from CA/DC
--    into ND. That is why per-slice deltas can look alarming while the year
--    total is fine.
-- -----------------------------------------------------------------------------
drop view if exists public.harvest_reconciliation_by_year;
drop view if exists public.harvest_reconciliation;

create view public.harvest_reconciliation as
with landed as (
  select
    c.series_year,
    case
      when c.surface_designation = 'CAM'  then 'CA'
      when c.surface_designation = 'DCAM' then 'DC'
      when c.surface_designation = 'PL'   then 'PL'
      when c.color in ('RD', 'RB', 'BN')  then c.color
      else 'ND'
    end as ha_desig,
    count(*)          as landed_n,
    max(c.scraped_at) as last_scraped_at
  from public.lots_coins c
  where c.denomination = '1C'
  group by 1, 2
)
select
  e.series_year,
  e.ha_desig,
  e.expected_n,
  coalesce(l.landed_n, 0)                as landed_n,
  coalesce(l.landed_n, 0) - e.expected_n as delta,
  l.last_scraped_at
from public.harvest_expectations e
left join landed l
       on l.series_year = e.series_year
      and l.ha_desig    = e.ha_desig
where e.source       = 'heritage'
  and e.category     = '3862'
  and e.denomination = '1C';

comment on view public.harvest_reconciliation is
  'Per-slice expected vs landed. DIAGNOSTIC ONLY: the landed-side bucket is inferred from color/surface_designation, so rejected or absent surface codes shift lots between buckets. Use harvest_reconciliation_by_year to decide whether to re-sweep; use this view to work out why.';


-- -----------------------------------------------------------------------------
-- 4. Per-year rollup -- THIS is the view you act on
--
--    status tiers:
--      not_started  landed_n = 0            never swept
--      ok           landed >= expected      complete (small surplus is normal)
--      near         >= 98% of expected      close enough, ignore
--      pending      <  10% of expected      sweep has not reached it yet
--      short        everything else         REAL GAP -- re-sweep this year
-- -----------------------------------------------------------------------------
create view public.harvest_reconciliation_by_year as
select
  r.series_year,
  sum(r.expected_n)                    as expected_n,
  sum(r.landed_n)                      as landed_n,
  sum(r.landed_n) - sum(r.expected_n)  as delta,
  round(100.0 * sum(r.landed_n) / nullif(sum(r.expected_n), 0), 1) as pct,
  case
    when sum(r.landed_n) = 0                                     then 'not_started'
    when sum(r.landed_n) >= sum(r.expected_n)                    then 'ok'
    when sum(r.landed_n)::numeric / nullif(sum(r.expected_n),0) >= 0.98 then 'near'
    when sum(r.landed_n)::numeric / nullif(sum(r.expected_n),0) <  0.10 then 'pending'
    else 'short'
  end                                  as status,
  max(r.last_scraped_at)               as last_scraped_at
from public.harvest_reconciliation r
group by r.series_year;

comment on view public.harvest_reconciliation_by_year is
  'Per-year harvest completeness. Act on status: short = real gap, re-sweep that year; pending = sweep has not reached it; near/ok = done. Year totals are trustworthy because they do not depend on inferring the HA facet bucket.';


-- -----------------------------------------------------------------------------
-- 5. RUNBOOK
--
--    a) After a sweep finishes (or any time you want a status read), run the
--       saved Supabase snippet "Heritage Harvest Reconciliation Check" --
--       favorited in the SQL Editor -- which is just:
--
--          select series_year, expected_n, landed_n, delta, pct, status
--          from public.harvest_reconciliation_by_year
--          order by status desc, delta asc;
--
--    b) Any year with status = 'short' needs a re-sweep. Find its slice
--       indexes in the harvester queue and set the queue index back to the
--       first of them:
--
--          const st = JSON.parse(localStorage.getItem('chq14'));
--          st.slices.forEach((s, i) => { if (s.year === 1937) console.log(i, s); });
--          // then, only after the current pass ends:
--          st.i = <first index>; localStorage.setItem('chq14', JSON.stringify(st));
--
--    c) To diagnose WHY a year is short, drop to the slice view:
--
--          select * from public.harvest_reconciliation
--          where series_year = 1937 order by ha_desig;
--
--       Two distinct failure signatures:
--         - RD (or the big bucket) short by hundreds/thousands = an incomplete
--           or interrupted pass. Re-sweep.
--         - CA and DC at exactly 0 while expected_n > 0 = the old proof/cameo
--           reject signature (pre-v1.4.4, when 'PR' was pushed into
--           strike_designation and the RPC rejected the row). Fixed by the
--           v2.1 RPC + strike_type column; those years just need re-sweeping.
--
--    d) If Heritage ever caps a slice's reachable depth, add finer facets and
--       re-seed this table. Do NOT try to solve it by flipping the sort to
--       oldest-first: reversing the sort only doubles reach and still loses the
--       middle of the run. Finer slicing gives complete coverage.
--
-- KNOWN QUIRK
--   Landed counts only include buckets that have a matching expectation row,
--   because the join is driven from harvest_expectations. Stray rows in a
--   bucket Heritage never advertised (e.g. 48 ND cents in 1936) are excluded.
--   This is deliberate: it keeps the check conservative and never reports a
--   year as complete on the strength of rows we cannot account for.
-- -----------------------------------------------------------------------------
