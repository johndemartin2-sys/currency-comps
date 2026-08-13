-- Catalog Master physical rename (JD 2026-08-12). Views/FK/indexes follow automatically (OID refs);
-- function bodies rewritten below; compat view covers any unknown external reader.

alter table public.friedberg_catalog rename to catalog_master;
alter table public.friedberg_catalog_conflicts rename to catalog_master_conflicts;

-- Compatibility shim for stragglers (single-table view: readable AND writable)
create view public.friedberg_catalog as select * from public.catalog_master;
comment on view public.friedberg_catalog is 'COMPAT SHIM 2026-08-12: table renamed to catalog_master. Update clients, then drop this view.';

-- Rewritten dependents
create or replace function public.ensure_fr_stub() returns trigger
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare v_enabled boolean; v_threshold int; v_window int; v_recent int;
begin
  if NEW.fr_canon is not null
     and not exists (select 1 from catalog_master c where c.fr_join_key = NEW.fr_canon) then
    select coalesce((select value='true' from ingest_guard_config where key='fr_stub_breaker_enabled'), true),
           coalesce((select value::int from ingest_guard_config where key='fr_stub_breaker_threshold'), 100),
           coalesce((select value::int from ingest_guard_config where key='fr_stub_breaker_window_hours'), 24)
      into v_enabled, v_threshold, v_window;
    if v_enabled then
      select count(*) into v_recent from catalog_master
       where status='stub' and source='auto-stub:trigger'
         and imported_at >= now() - make_interval(hours => v_window);
      if v_recent >= v_threshold then
        raise exception 'FR-STUB CIRCUIT BREAKER: % trigger stubs in last %h (threshold %). Ingestion of unknown-Fr lots halted - investigate harvester/catalog before releasing (set fr_stub_breaker_enabled=false or clear stubs). Offending key: %',
          v_recent, v_window, v_threshold, NEW.fr_canon;
      end if;
    end if;
    insert into catalog_master (row_id, fr_number, source, imported_at, status)
    values (nextval('fr_stub_row_id_seq'),
            case when NEW.fr_canon ~ '^[0-9]+[A-Z]+$'
                 then regexp_replace(NEW.fr_canon, '^([0-9]+)([A-Z]+)$', '\1-\2')
                 else NEW.fr_canon end,
            'auto-stub:trigger', now(), 'stub')
    on conflict do nothing;
  end if;
  return NEW;
end $$;

create or replace function public.analytics_fr_stubs(days integer default 7)
returns table (fr_number text, first_seen timestamptz, source text,
               lot_count bigint, sample_title text, est_value numeric)
language sql stable as $$
  select c.fr_number, c.imported_at, c.source,
         count(lc.id), max(lc.title), sum(lc.price_realized)
  from catalog_master c
  left join lots_currency lc on lc.fr_canon = c.fr_join_key
  where c.status = 'stub'
    and c.imported_at >= now() - make_interval(days => days)
  group by c.fr_number, c.imported_at, c.source
  order by count(lc.id) desc
$$;

create or replace function public.resolve_lot_from_catalog() returns trigger
language plpgsql as $$
declare c_type text; c_denom text; c_year text; c_fr text; is_national boolean;
begin
  is_national := (NEW.charter_number is not null and btrim(NEW.charter_number) <> '')
                 and (NEW.friedberg_number is null or btrim(NEW.friedberg_number) = '');
  if is_national then return NEW; end if;

  -- FR-FIRST, now via unique canonical key (heuristic ORDER BY obsolete post-dedupe)
  if NEW.friedberg_number is not null and btrim(NEW.friedberg_number) <> '' then
    select cm.type, cm.denomination, cm.series_year into c_type, c_denom, c_year
    from public.catalog_master cm
    where cm.fr_join_key = public.fr_canon(NEW.friedberg_number)
    limit 1;
    if found then
      if c_type  is not null then NEW.series_type  := c_type;  end if;
      if c_denom is not null then NEW.denomination := c_denom; end if;
      if c_year ~ '^(1[89]|20)[0-9][0-9]$' then NEW.series_year := c_year::integer; end if;
      return NEW;
    end if;
  end if;

  -- NO FR: triangulate year+denom+type; adopt only if unique
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
end $$;

-- Reverse-button script must target the new physical name
update rollback.artifacts
   set content = replace(content, 'public.friedberg_catalog', 'public.catalog_master')
 where name = 'ROLLBACK_fr_master_repivot';
