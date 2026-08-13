-- Experimental SC fix (JD-approved 2026-08-12), two directions:
-- Type 1 (1601/1602/1607): block-level sub-varieties inside the Fr# -> KEEP suffix keys, add catalog entries, strengthen detection.
-- Type 2 (1609/1610): experimental IS the Fr# -> remove suffix minting, unify comps on base keys.

-- 1. Type-1 catalog entries: upgrade existing stubs in place; insert if absent
update catalog_master c
   set size_category='Small', type='Silver Certificates', denomination='$1', denomination_value=1,
       series_year = case c.fr_join_key when '1601EXP' then '1928' when '1602EXP' then '1928' else '1935' end,
       type_variant = 'Experimental (block-identified)',
       notes = case c.fr_join_key
         when '1601EXP' then '1928A paper-content experimentals: X-B/Y-B blocks special paper, Z-B control. No markings; serial block only.'
         when '1602EXP' then '1928B paper-content experimentals: X-B 50/50 linen-cotton, Y-B 75/25, Z-B control. No markings; serial block only.'
         else '1935 experimentals delivered 1937: A-B and B-B special papers, C-B control (printed ~10 days Dec 1937). Serial block only.' end,
       status='curated', source='curated:experimental-varieties 2026-08-12'
 where c.fr_join_key in ('1601EXP','1602EXP','1607EXP') and c.status='stub';

insert into catalog_master (row_id, fr_number, size_category, type, denomination, denomination_value, series_year, type_variant, notes, source, imported_at, status)
select nextval('fr_stub_row_id_seq'), v.frn, 'Small', 'Silver Certificates', '$1', 1, v.yr,
       'Experimental (block-identified)', v.nt, 'curated:experimental-varieties 2026-08-12', now(), 'curated'
from (values
  ('1601-EXP','1928','1928A paper-content experimentals: X-B/Y-B blocks special paper, Z-B control.'),
  ('1602-EXP','1928','1928B paper-content experimentals: X-B 50/50, Y-B 75/25, Z-B control.'),
  ('1607-EXP','1935','1935 experimentals delivered 1937: A-B/B-B special papers, C-B control.')) v(frn, yr, nt)
where not exists (select 1 from catalog_master c where c.fr_join_key = public.fr_canon(v.frn));

-- 2. Mark base 1609/1610 as intrinsically experimental
update catalog_master set type_variant='R experimental (1944 paper test, red R overprint)'
 where fr_join_key='1609';
update catalog_master set type_variant='S experimental (1944 paper test, red S overprint)'
 where fr_join_key='1610';

-- 3. Trigger rewrite: drop 1609/1610 from EXP minting; add block-pattern detection for Type 1
create or replace function public.set_fr_canon() returns trigger
language plpgsql set search_path to 'pg_catalog','public','pg_temp' as $$
declare v_src text; v_base text; v_multi int;
begin
  v_src := case when nullif(NEW.friedberg_number,'') is not null then NEW.friedberg_number
                when nullif(NEW.charter_number,'')   is not null then NEW.charter_number
                else nullif(NEW.catalog_number,'') end;

  v_multi := coalesce(array_length(array(
    select distinct m[1]
    from regexp_matches(coalesce(NEW.title,''),'Fr[.][[:space:]]*([0-9]{3,4})[A-Za-z*]*[[:space:]]*[$]','gi') as m
  ),1),0);

  if v_multi >= 2 then
    NEW.is_multi_fr_lot := true;
    NEW.fr_canon := null;
    NEW.fr_base_canon := null;
    return NEW;
  end if;

  NEW.is_multi_fr_lot := false;
  v_base := public.fr_base_canon(v_src);

  -- Type-1 experimentals ONLY (1601/1602/1607): block-identified sub-varieties within the Fr#.
  -- 1609/1610 REMOVED (2026-08-12): those Fr#s are intrinsically experimental; suffix split their comps.
  if v_base in ('1601','1602','1607')
     and public.fr_canon(v_src) !~ 'EXP$'
     and (
       (coalesce(NEW.title,'') ilike '%experiment%'
        and coalesce(NEW.denomination,'') ~ '(^|[^0-9])1($|[^0-9])'
        and (coalesce(NEW.series_type,'') ilike '%silver%' or coalesce(NEW.series_canonical,'') ilike '%silver%'))
       or (v_base in ('1601','1602') and coalesce(NEW.title,'') ~* '\m[XYZ][- ]?B\M')
       or (v_base = '1607'           and coalesce(NEW.title,'') ~* '\m[ABC][- ]?B\M')
     ) then
    v_src := regexp_replace(v_src, '[-]?[Ee]$', '') || 'exp';
  end if;

  NEW.fr_canon := public.fr_canon(v_src);
  NEW.fr_base_canon := public.fr_base_canon(v_src);
  return NEW;
end $$;

-- 4. Re-key Type-2 lots: pre-image, then touch rows so the pipeline re-derives without 'exp'
create table if not exists rollback.exp_rekey_1609_1610_20260812 as
select id, fr_canon as old_fr_canon, friedberg_number
from lots_currency where fr_canon in ('1609EXP','1610EXP');

update lots_currency set friedberg_number = friedberg_number
 where fr_canon in ('1609EXP','1610EXP');

-- 5. Remove the now-orphaned Type-2 stubs (FK RESTRICT guards if anything still references)
delete from catalog_master where fr_join_key in ('1609EXP','1610EXP') and status='stub'
  and not exists (select 1 from lots_currency lc where lc.fr_canon = catalog_master.fr_join_key);
