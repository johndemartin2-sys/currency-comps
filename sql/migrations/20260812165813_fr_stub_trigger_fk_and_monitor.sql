-- fr-master-repivot step 3d: stub-generating trigger, FK, and stub monitor (Option A per JD)

create sequence if not exists public.fr_stub_row_id_seq start 40000;

create or replace function public.ensure_fr_stub() returns trigger
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  if NEW.fr_canon is not null
     and not exists (select 1 from friedberg_catalog c where c.fr_join_key = NEW.fr_canon) then
    insert into friedberg_catalog (row_id, fr_number, source, imported_at, status)
    values (nextval('fr_stub_row_id_seq'),
            case when NEW.fr_canon ~ '^[0-9]+[A-Z]+$'
                 then regexp_replace(NEW.fr_canon, '^([0-9]+)([A-Z]+)$', '\1-\2')
                 else NEW.fr_canon end,
            'auto-stub:trigger', now(), 'stub')
    on conflict do nothing;  -- concurrent harvester race: first writer wins
  end if;
  return NEW;
end $$;

-- zzzz_ sorts after zzz_fr_canon_trg: runs once fr_canon is derived
create trigger zzzz_fr_stub_trg
  before insert or update of friedberg_number, catalog_number, charter_number, title
  on public.lots_currency
  for each row execute function public.ensure_fr_stub();

-- The FK itself: NOT VALID first (no long lock), validate immediately after
alter table public.lots_currency
  add constraint lots_currency_fr_canon_fkey
  foreign key (fr_canon) references public.friedberg_catalog (fr_join_key)
  on update cascade on delete restrict
  not valid;

alter table public.lots_currency validate constraint lots_currency_fr_canon_fkey;

-- Monitor in the analytics_* convention: stubs found post-harvest
create or replace function public.analytics_fr_stubs(days integer default 7)
returns table (fr_number text, first_seen timestamptz, source text,
               lot_count bigint, sample_title text, est_value numeric)
language sql stable as $$
  select c.fr_number, c.imported_at, c.source,
         count(lc.id), max(lc.title), sum(lc.price_realized)
  from friedberg_catalog c
  left join lots_currency lc on lc.fr_canon = c.fr_join_key
  where c.status = 'stub'
    and c.imported_at >= now() - make_interval(days => days)
  group by c.fr_number, c.imported_at, c.source
  order by count(lc.id) desc
$$;
