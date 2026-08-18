-- =====================================================================
-- 20260818_fr_series_reject_guard  (APPLIED to live 2026-08-18)
-- Server-side reject guard: a harvester bug must not be able to write a
-- series_year that equals the lot's own Friedberg base number. This is
-- the signature of the district-letter / Fr#-as-year parse bug that
-- corrupted 30,987 rows (see docs/INGEST_ROOT_CAUSE.md).
--
-- ONE genuine exception exists and is census-validated: Fr. 1969 really
-- is a $5 FRN of Series 1969 (419/421 live titles agree). The guard
-- consults v_census_series, so any future genuine self-match added to
-- the census is honoured automatically -- no code change needed.
--
-- The 63 curated/majority catalog_master rows that ALSO claimed
-- series = own Fr base (e.g. Fr.1901 -> "1901") are catalog corruption,
-- NOT exceptions; they are quarantined in 20260818b.
--
-- Guard test results (as-run):
--   corrupt pair (1975,'1975-H')  -> reject     PASS
--   genuine     (1969,'1969K')    -> allowed    PASS
--   non-equal   (1928,'1531')     -> allowed    PASS
--   nulls                          -> allowed    PASS
-- =====================================================================

create or replace function public.fr_guard_series_year(
  p_series_year integer, p_friedberg_number text
) returns void
language plpgsql stable
set search_path to 'public'
as $$
begin
  if p_series_year is null or p_friedberg_number is null or p_friedberg_number = '' then
    return;
  end if;
  if p_series_year::text is distinct from public.fr_base_canon(p_friedberg_number) then
    return;
  end if;
  -- census-validated self-match (Fr. 1969 = Series 1969) passes
  if exists (
    select 1 from public.v_census_series v
    where public.fr_base_canon(v.fr_join_key) = p_series_year::text
      and left(v.series_designation, 4) = p_series_year::text
  ) then
    return;
  end if;
  raise exception
    'reject: series_year (%) equals friedberg base of "%" - probable parse error (Fr# or district letter read as series year)',
    p_series_year, p_friedberg_number;
end $$;

-- Splice "PERFORM public.fr_guard_series_year(...)" immediately after the
-- top-level BEGIN of each currency ingest RPC. Idempotent: functions that
-- already contain the guard call are skipped.
do $$
declare
  fn record;
  d  text;
begin
  for fn in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('ingest_heritage_lot','ingest_stacks_bowers_lot','ingest_ebay_lot')
  loop
    d := pg_get_functiondef(fn.oid);
    if d ~ 'fr_guard_series_year' then
      raise notice '% already guarded, skipping', fn.proname;
      continue;
    end if;
    d := regexp_replace(
      d,
      '(\mBEGIN\M[\r\n]+)',
      '\1  PERFORM public.fr_guard_series_year(p_series_year, p_friedberg_number);' || E'\n',
      'i');
    execute d;
    raise notice '% guarded', fn.proname;
  end loop;
end $$;
