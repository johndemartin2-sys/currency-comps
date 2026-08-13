-- fr-master-repivot step 1 (PROD): dedupe friedberg_catalog and enforce unique fr_key
-- Rulings 2026-08-12 (JD): Fr.1166-I undecided -> conflicts table; Fr.1222-A = Rosecrans,Nebecker/Small red kept.
-- Rehearsed: branch fr-master-repivot + prod dry-run txn (4613 -> 4551 master / 2 conflicts / 0 collisions).
-- Reverse: rollback.artifacts 'ROLLBACK_fr_master_repivot' (tested).
-- Idempotent by design: safe if re-applied at branch merge.

create table if not exists public.friedberg_catalog_conflicts
  (like public.friedberg_catalog including all excluding indexes);

with moved as (
  delete from public.friedberg_catalog where lower(fr_number)='1166-i' returning *
)
insert into public.friedberg_catalog_conflicts
  (row_id, fr_number, size_category, type, denomination, denomination_value, series_year,
   signatures, seal, district, districts_letters, city_location, bank, bank_signatures,
   type_variant, notes, source, imported_at, status)
select row_id, fr_number, size_category, type, denomination, denomination_value, series_year,
       signatures, seal, district, districts_letters, city_location, bank, bank_signatures,
       type_variant, notes, source, imported_at, status from moved;

delete from public.friedberg_catalog
 where lower(fr_number)='1222-a' and signatures='Lyons,Roberts';

with twins as (
  select row_id, row_number() over (
      partition by fr_number, coalesce(size_category,''), coalesce(type,''), coalesce(denomination,''),
                   coalesce(denomination_value,-1), coalesce(series_year,''), coalesce(signatures,''),
                   coalesce(seal,''), coalesce(district,''), coalesce(districts_letters,''),
                   coalesce(city_location,''), coalesce(bank,''), coalesce(status,'')
      order by row_id) as rn
  from public.friedberg_catalog)
delete from public.friedberg_catalog where row_id in (select row_id from twins where rn>1);

with ranked as (
  select row_id, fr_number, status,
    (size_category is not null)::int+(signatures is not null)::int+(seal is not null)::int+
    (district is not null)::int+(districts_letters is not null)::int+(series_year is not null)::int as richness,
    count(*) over (partition by fr_number) as n,
    count(*) filter (where status='curated') over (partition by fr_number) as n_curated
  from public.friedberg_catalog),
losers as (
  select row_id from ranked
  where n>1 and n_curated<2
    and row_id not in (
      select distinct on (fr_number) row_id from ranked
      where n>1 and n_curated<2
      order by fr_number, (status='curated') desc, richness desc, row_id asc))
delete from public.friedberg_catalog where row_id in (select row_id from losers);

do $$
declare bad int;
begin
  select count(*) into bad from (
    select fr_key from public.friedberg_catalog group by fr_key having count(*) > 1) t;
  if bad > 0 then
    raise exception 'Dedupe incomplete: % fr_key collisions remain - aborting before index', bad;
  end if;
end $$;

update public.friedberg_catalog set series_year=null
 where series_year is not null
   and series_year !~ '^(18[6-9][0-9]|19[0-9]{2}|20[0-2][0-9])$';

create unique index if not exists friedberg_catalog_fr_key_uniq
  on public.friedberg_catalog (fr_key);
