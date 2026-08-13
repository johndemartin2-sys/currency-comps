-- fr-master-repivot step 2a: normalized dedupe + canonical join key
-- 335 formatting twins (hyphen/case variants), zero attribute conflicts. Rules per JD-approved precedence.
with ranked as (
  select row_id, fr_norm(fr_number) as k, status,
    (size_category is not null)::int+(signatures is not null)::int+(seal is not null)::int+
    (district is not null)::int+(districts_letters is not null)::int+(series_year is not null)::int+
    (fr_number ~ '-')::int as richness,
    count(*) over (partition by fr_norm(fr_number)) as n
  from public.friedberg_catalog),
losers as (
  select row_id from ranked
  where n>1 and row_id not in (
    select distinct on (k) row_id from ranked where n>1
    order by k, (status='curated') desc, richness desc, row_id asc))
delete from public.friedberg_catalog where row_id in (select row_id from losers);

do $$
declare bad int;
begin
  select count(*) into bad from (
    select fr_norm(fr_number) from public.friedberg_catalog group by 1 having count(*)>1) t;
  if bad > 0 then raise exception 'Normalized collisions remain: %', bad; end if;
end $$;

alter table public.friedberg_catalog add column if not exists fr_join_key text
  generated always as (public.fr_norm(fr_number)) stored;
create unique index if not exists friedberg_catalog_fr_join_key_uniq
  on public.friedberg_catalog (fr_join_key);
