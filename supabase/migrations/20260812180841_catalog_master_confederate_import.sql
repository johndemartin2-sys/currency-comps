-- Catalog Master step 1 (JD 2026-08-12): multi-system discriminator + Confederate T-number import
-- "Fr Master" is renamed conceptually to CATALOG MASTER; physical table rename is a separate gated step.

alter table public.friedberg_catalog
  add column if not exists catalog_system text not null default 'friedberg';

-- Pre-image of the 72 stubs being upgraded (trivially reversible, but doctrine is doctrine)
create table if not exists rollback.t_stub_upgrade_20260812 as
select * from public.friedberg_catalog c
where c.status='stub' and c.fr_join_key ~ '^T[0-9]+$';

-- In-place upgrade: stub -> curated with Confederate attributes (keys unchanged, FK untouched)
update public.friedberg_catalog c
   set fr_number   = cc.catalog_number,
       type        = coalesce(cc.type_class, 'Confederate Currency'),
       denomination = cc.denomination,
       denomination_value = nullif(regexp_replace(coalesce(cc.denomination,''), '[^0-9.]', '', 'g'), '')::numeric,
       series_year = nullif(regexp_replace(coalesce(cc.series_year::text,''), '[^0-9].*$', ''), ''),
       notes       = nullif(concat_ws(' | ', cc.issue_series, cc.date_on_note, cc.design_vignette), ''),
       catalog_system = 'confederate',
       source      = 'import:confederate_catalog 2026-08-12',
       status      = 'curated'
  from public.confederate_catalog cc
 where c.status = 'stub'
   and c.fr_join_key = public.fr_canon(cc.catalog_number);

do $$
declare bad int;
begin
  select count(*) into bad from (
    select fr_join_key from public.friedberg_catalog group by 1 having count(*)>1) t;
  if bad > 0 then raise exception 'Key collision after import: %', bad; end if;
end $$;
