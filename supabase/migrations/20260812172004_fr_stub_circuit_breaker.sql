-- Circuit breaker: halt stub-creating ingestion when trigger stubs exceed threshold in window (JD 2026-08-12)
create table if not exists public.ingest_guard_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.ingest_guard_config (key, value) values
  ('fr_stub_breaker_enabled', 'true'),
  ('fr_stub_breaker_threshold', '100'),
  ('fr_stub_breaker_window_hours', '24')
on conflict (key) do nothing;

create or replace function public.ensure_fr_stub() returns trigger
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare v_enabled boolean; v_threshold int; v_window int; v_recent int;
begin
  if NEW.fr_canon is not null
     and not exists (select 1 from friedberg_catalog c where c.fr_join_key = NEW.fr_canon) then

    select coalesce((select value='true' from ingest_guard_config where key='fr_stub_breaker_enabled'), true),
           coalesce((select value::int from ingest_guard_config where key='fr_stub_breaker_threshold'), 100),
           coalesce((select value::int from ingest_guard_config where key='fr_stub_breaker_window_hours'), 24)
      into v_enabled, v_threshold, v_window;

    if v_enabled then
      select count(*) into v_recent from friedberg_catalog
       where status = 'stub' and source = 'auto-stub:trigger'
         and imported_at >= now() - make_interval(hours => v_window);
      if v_recent >= v_threshold then
        raise exception 'FR-STUB CIRCUIT BREAKER: % trigger stubs in last %h (threshold %). Ingestion of unknown-Fr lots halted - investigate harvester/catalog before releasing (set fr_stub_breaker_enabled=false or clear stubs). Offending key: %',
          v_recent, v_window, v_threshold, NEW.fr_canon;
      end if;
    end if;

    insert into friedberg_catalog (row_id, fr_number, source, imported_at, status)
    values (nextval('fr_stub_row_id_seq'),
            case when NEW.fr_canon ~ '^[0-9]+[A-Z]+$'
                 then regexp_replace(NEW.fr_canon, '^([0-9]+)([A-Z]+)$', '\1-\2')
                 else NEW.fr_canon end,
            'auto-stub:trigger', now(), 'stub')
    on conflict do nothing;
  end if;
  return NEW;
end $$;
