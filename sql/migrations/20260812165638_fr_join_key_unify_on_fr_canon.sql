-- fr-master-repivot step 3a: unify join key on fr_canon() (one canonicalizer, both sides)
begin;
drop view public.lots_currency_resolved cascade;  -- matview DDL vaulted in rollback.artifacts

alter table public.friedberg_catalog drop column fr_join_key;
alter table public.friedberg_catalog add column fr_join_key text
  generated always as (public.fr_canon(fr_number)) stored;
create unique index friedberg_catalog_fr_join_key_uniq
  on public.friedberg_catalog (fr_join_key);

create view public.lots_currency_resolved as
select
  lc.*,
  coalesce(lc.grade_numeric, lc.grade_numeric_est) as grade_numeric_search,
  case when lc.charter_number is not null and lc.charter_number <> ''
            and (lc.friedberg_number is null or lc.friedberg_number = '')
       then lc.friedberg_number
       else coalesce(cat.fr_number, lc.friedberg_number, lc.catalog_number) end as display_fr,
  case when lc.charter_number is not null and lc.charter_number <> ''
            and (lc.friedberg_number is null or lc.friedberg_number = '')
       then (lc.series_year)::text
       else coalesce(nullif(cat.series_year,''), (lc.series_year)::text) end as display_year,
  coalesce(lc.denomination_canonical,
    case when lc.charter_number is not null and lc.charter_number <> ''
              and (lc.friedberg_number is null or lc.friedberg_number = '')
         then lc.denomination
         else coalesce(cat.denomination, lc.denomination) end) as display_denom,
  case when lc.charter_number is not null and lc.charter_number <> ''
            and (lc.friedberg_number is null or lc.friedberg_number = '')
       then lc.series_type
       else coalesce(cat.type, lc.series_type) end as display_type,
  case when lc.charter_number is not null and lc.charter_number <> ''
            and (lc.friedberg_number is null or lc.friedberg_number = '')
       then null::text else cat.districts_letters end as display_district,
  coalesce(nullif(lc.signatures,''), cat.signatures) as display_signatures,
  cat.seal as display_seal
from public.lots_currency lc
left join public.friedberg_catalog cat on cat.fr_join_key = lc.fr_canon;

create materialized view public.title_word_freq as
 select word, count(*) as n
 from (select regexp_replace(lower(unnest(regexp_split_to_array(title, '\s+'))), '[^a-z0-9]+', '', 'g') as word
       from public.lots_currency_resolved where title is not null) w
 where length(word) >= 3 group by word
 with no data;
commit;
