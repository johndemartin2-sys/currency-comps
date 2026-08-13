-- 1. Vault all three originals
insert into rollback.artifacts (name, kind, content)
select 'fn_' || p.proname || '_' || p.oid::text || '_pre_20260812', 'ddl', pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('ingest_heritage_coin_lot','ingest_stacks_bowers_lot')
on conflict (name) do nothing;

-- 2. Coin RPC: 'ok:' -> 'ins:'/'upd:' via the xmax-zero test on the upsert.
--    Everything else byte-identical. Makes the coin harvester's top-up
--    whole-page stop functional with ZERO script changes.
do $do$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='ingest_heritage_coin_lot';
  v_def := replace(v_def,
    'raw=EXCLUDED.raw, updated_at=EXCLUDED.updated_at;',
    'raw=EXCLUDED.raw, updated_at=EXCLUDED.updated_at
RETURNING (xmax = 0) INTO v_inserted;');
  v_def := replace(v_def,
    'RETURN ''ok:'' || p_source_lot_id;',
    'RETURN (CASE WHEN v_inserted THEN ''ins:'' ELSE ''upd:'' END) || p_source_lot_id;');
  v_def := replace(v_def,
    'v_stype text := NULLIF(upper(btrim(p_strike_type)),'''');',
    'v_stype text := NULLIF(upper(btrim(p_strike_type)),'''');
v_inserted boolean;');
  execute v_def;
end $do$;

-- 3. Drop the stale SB overload (16-param, pre-Friedberg, unreachable by v8.7.x payloads)
drop function public.ingest_stacks_bowers_lot(text,text,text,text,date,numeric,text,boolean,text,text,integer,text,integer,text,text,jsonb);

-- 4. Surviving SB overload: add reject guards (heritage-parity), ins/upd return,
--    and pin search_path (SECURITY DEFINER hygiene).
create or replace function public.ingest_stacks_bowers_lot(
  p_source_lot_id text, p_lot_url text, p_title text, p_series_type text,
  p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean,
  p_grading_company text, p_grade_raw text, p_grade_numeric integer,
  p_auction_event_id text, p_auction_event_name text, p_friedberg_number text,
  p_type_class text, p_series_year integer, p_series_letter text, p_state_code text, p_raw jsonb)
returns text language plpgsql security definer
set search_path to 'public','pg_catalog' as $$
declare v_inserted boolean;
begin
  -- v2026-08-12 guards: SB previously accepted anything as data_quality='trusted'
  if p_source_lot_id is null or p_source_lot_id = '' then raise exception 'reject: source_lot_id missing'; end if;
  if p_sold_on is null then raise exception 'reject: sold_on missing'; end if;
  if p_price_realized is null then raise exception 'reject: price_realized missing (unsold or hidden)'; end if;
  if p_grade_numeric is not null and (p_grade_numeric < 1 or p_grade_numeric > 70) then
    raise exception 'reject: grade_numeric out of range'; end if;

  insert into public.lots_currency (
    source, source_lot_id, lot_url, title,
    sold_on, price_realized, price_kind,
    series_type, type_class, denomination, friedberg_number, is_star_note,
    grading_company, grade_raw, grade_numeric,
    auction_event_id, auction_event_name,
    series_year, series_letter, state_code,
    data_quality, raw, scraped_at, updated_at
  ) values (
    'stacks_bowers', p_source_lot_id, p_lot_url, p_title,
    p_sold_on, p_price_realized, 'realized',
    p_series_type, nullif(p_type_class,'')::currency_type_class_enum, p_denomination, p_friedberg_number,
    (coalesce(p_is_star_note, false) or p_friedberg_number ~ '[*★]'
      or p_title ~* '(star|replacement)[[:space:]]+note'
      or (p_title ~ '[*★]' and p_title !~* 'lot of|group| set |examples|consecutive|pack of|\(\d+\)| & ')),
    nullif(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
    p_auction_event_id, p_auction_event_name,
    p_series_year, p_series_letter, p_state_code,
    'trusted', p_raw, now(), now()
  )
  on conflict (source, source_lot_id) do update set
    lot_url=excluded.lot_url, title=excluded.title, sold_on=excluded.sold_on,
    price_realized=excluded.price_realized, series_type=excluded.series_type,
    type_class=excluded.type_class, denomination=excluded.denomination,
    friedberg_number=excluded.friedberg_number, is_star_note=excluded.is_star_note,
    grading_company=excluded.grading_company, grade_raw=excluded.grade_raw,
    grade_numeric=excluded.grade_numeric, auction_event_id=excluded.auction_event_id,
    auction_event_name=excluded.auction_event_name, series_year=excluded.series_year,
    series_letter=excluded.series_letter, state_code=excluded.state_code,
    raw=excluded.raw, updated_at=now()
  returning (xmax = 0) into v_inserted;

  return (case when v_inserted then 'ins:' else 'upd:' end) || p_source_lot_id;
end $$;
