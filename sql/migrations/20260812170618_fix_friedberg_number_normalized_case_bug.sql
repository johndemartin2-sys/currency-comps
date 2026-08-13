-- Retry with statement timeout lifted for the table rewrite (txn-local only)
set local statement_timeout = 0;

insert into rollback.artifacts (name, kind, content) values
 ('gencol_friedberg_number_normalized_old', 'ddl',
  $D$ALTER TABLE public.lots_currency ADD COLUMN friedberg_number_normalized text GENERATED ALWAYS AS (lower(regexp_replace(COALESCE(friedberg_number,''), '[^0-9a-z]', '', 'g'))) STORED$D$)
 on conflict (name) do nothing;

drop view public.lots_currency_resolved cascade;

alter table public.lots_currency drop column friedberg_number_normalized;
alter table public.lots_currency add column friedberg_number_normalized text
  generated always as (lower(regexp_replace(coalesce(friedberg_number,''), '[^0-9A-Za-z]', '', 'g'))) stored;
create index idx_lots_curr_fr_norm on public.lots_currency (friedberg_number_normalized);

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
