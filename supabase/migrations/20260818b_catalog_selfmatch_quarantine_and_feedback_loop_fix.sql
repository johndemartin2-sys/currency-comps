-- =====================================================================
-- 20260818b  (APPLIED to live 2026-08-18)
-- Two coupled fixes, applied together because the second would re-teach
-- the corruption the first removes.
--
-- PART 1 - quarantine 62 catalog rows whose series equals their own
-- Friedberg base number (Fr.1901 -> "1901" etc). These are the
-- lot-corruption signature echoed INTO the catalog via curated (53) and
-- majority-vote (9) sources. The census-validated Fr.1969 family
-- (genuinely Series 1969) is excluded. Both series_designation and the
-- legacy series_year column are nulled - the trigger's fallback branch
-- reads series_year, so leaving it would defeat the quarantine.
-- Backup: bak_catalog_selfmatch_20260818 (62 rows as-run).
--
-- PART 2 - the section-7 feedback-loop fix drafted in
-- 20260817_catalog_series_designation.sql, now applied:
-- resolve_lot_from_catalog may only set a lot's series from a trusted
-- catalog row (trust_rank <= 2), and now sets the LETTER too.
-- Majority-vote rows (rank 3, derived FROM the lots) may never re-teach
-- the lots. Discovered the hard way: the old trigger silently overwrote
-- 24,486 of the 42,526 backfill writes in 20260818e before this fix.
-- =====================================================================

-- PART 1: backup then quarantine
create table if not exists public.bak_catalog_selfmatch_20260818 as
select row_id, fr_join_key, series_designation, series_source, series_year, trust_rank
from public.catalog_master
where series_designation is not null
  and left(series_designation,4) = public.fr_base_canon(fr_join_key)
  and public.fr_base_canon(fr_join_key) <> '1969'
  and series_source <> 'census';

update public.catalog_master cm
   set series_designation = null,
       series_source = 'selfmatch_quarantine_20260818',
       trust_rank = 9,
       series_year = null
 where cm.row_id in (select row_id from public.bak_catalog_selfmatch_20260818);

-- PART 2: trusted-only trigger (section 7, with letter support)
create or replace function public.resolve_lot_from_catalog()
returns trigger language plpgsql as $function$
declare
  c_type text; c_denom text; c_year text; c_series text; c_fr text;
  c_trust smallint; is_national boolean;
begin
  is_national := (NEW.charter_number is not null and btrim(NEW.charter_number) <> '')
                 and (NEW.friedberg_number is null or btrim(NEW.friedberg_number) = '');
  if is_national then return NEW; end if;

  if NEW.friedberg_number is not null and btrim(NEW.friedberg_number) <> '' then
    select cm.type, cm.denomination, cm.series_year, cm.series_designation, cm.trust_rank
      into c_type, c_denom, c_year, c_series, c_trust
    from public.catalog_master cm
    where cm.fr_join_key = public.fr_canon(NEW.friedberg_number)
    limit 1;

    if found then
      if c_type  is not null then NEW.series_type  := c_type;  end if;
      if c_denom is not null then NEW.denomination := c_denom; end if;

      -- only census / curated may set the series. Never majority-vote.
      if coalesce(c_trust, 9) <= 2 and c_series ~ '^[0-9]{4}[A-H]?$' then
        NEW.series_year   := left(c_series, 4)::integer;
        NEW.series_letter := nullif(substring(c_series from 5), '');
      elsif coalesce(c_trust, 9) <= 2 and c_year ~ '^(1[89]|20)[0-9][0-9]$' then
        NEW.series_year := c_year::integer;
      end if;

      return NEW;
    end if;
  end if;

  -- unchanged: triangulate year+denom+type when there is no Fr#
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
end $function$;
