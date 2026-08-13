-- JD ruling 2026-08-12: charter_number removed from fr_canon derivation.
-- NBNs (charter, no Fr#) now carry fr_canon NULL - they key on charter_number alone.
-- Prior behavior vaulted: fn_set_fr_canon_eod20260812.
create or replace function public.set_fr_canon() returns trigger
language plpgsql set search_path to 'pg_catalog','public','pg_temp' as $$
declare v_src text; v_base text; v_multi int;
begin
  v_src := case when nullif(NEW.friedberg_number,'') is not null then NEW.friedberg_number
                else nullif(NEW.catalog_number,'') end;   -- charter fallback REMOVED

  v_multi := coalesce(array_length(array(
    select distinct m[1]
    from regexp_matches(coalesce(NEW.title,''),'Fr[.][[:space:]]*([0-9]{3,4})[A-Za-z*]*[[:space:]]*[$]','gi') as m
  ),1),0);

  if v_multi >= 2 then
    NEW.is_multi_fr_lot := true; NEW.fr_canon := null; NEW.fr_base_canon := null;
    return NEW;
  end if;

  NEW.is_multi_fr_lot := false;
  v_base := public.fr_base_canon(v_src);

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
