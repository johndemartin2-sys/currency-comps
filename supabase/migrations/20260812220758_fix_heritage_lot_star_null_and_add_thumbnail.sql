-- Vault current
insert into rollback.artifacts (name, kind, content)
select 'fn_ingest_heritage_lot_pre_thumb_20260812', 'ddl', pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='ingest_heritage_lot'
on conflict (name) do nothing;

-- (1) Defuse the star-note null bomb (same fix as SB), in place: same signature.
do $do$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='ingest_heritage_lot';
  v_def := replace(v_def,
    $$(COALESCE(p_is_star_note, false) OR p_friedberg_number ~ '[*★]' OR p_title$$,
    $$COALESCE((COALESCE(p_is_star_note, false) OR COALESCE(p_friedberg_number,'') ~ '[*★]' OR p_title$$);
  -- close the added COALESCE: the expression ends just before the next parameter in VALUES
  -- find the tail: the original expression's closing paren sequence -> append ', false)'
  -- The star expression ends with: | & ')))
  v_def := replace(v_def,
    $$| & '))$$,
    $$| & ')), false)$$);
  execute v_def;
end $do$;
