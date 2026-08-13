-- Root cause: p_friedberg_number ~ '[*★]' yields NULL when fr is NULL (colonials,
-- obsoletes), and false OR NULL = NULL -> 23502 on NOT NULL is_star_note.
-- Fix: null-proof the term + belt-and-suspenders outer coalesce. Capture wrapper removed.
create or replace function public.ingest_stacks_bowers_lot(
  p_source_lot_id text, p_lot_url text, p_title text, p_series_type text,
  p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean,
  p_grading_company text, p_grade_raw text, p_grade_numeric integer,
  p_auction_event_id text, p_auction_event_name text, p_friedberg_number text,
  p_type_class text, p_series_year integer, p_series_letter text, p_state_code text, p_raw jsonb,
  p_thumbnail_url text default null)
returns text language plpgsql security definer
set search_path to 'public','pg_catalog' as $$
declare v_inserted boolean;
begin
  if p_source_lot_id is null or p_source_lot_id = '' then raise exception 'reject: source_lot_id missing'; end if;
  if p_sold_on is null then raise exception 'reject: sold_on missing'; end if;
  if p_price_realized is null then raise exception 'reject: price_realized missing (unsold or hidden)'; end if;
  if p_grade_numeric is not null and (p_grade_numeric < 1 or p_grade_numeric > 70) then
    raise exception 'reject: grade_numeric out of range'; end if;

  insert into public.lots_currency (
    source, source_lot_id, lot_url, title, sold_on, price_realized, price_kind,
    series_type, type_class, denomination, friedberg_number, is_star_note,
    grading_company, grade_raw, grade_numeric,
    auction_event_id, auction_event_name, series_year, series_letter, state_code,
    thumbnail_url, data_quality, raw, scraped_at, updated_at
  ) values (
    'stacks_bowers', p_source_lot_id, p_lot_url, p_title, p_sold_on, p_price_realized, 'realized',
    p_series_type, nullif(p_type_class,'')::currency_type_class_enum, p_denomination, p_friedberg_number,
    coalesce(
      (coalesce(p_is_star_note, false) or coalesce(p_friedberg_number,'') ~ '[*★]'
        or p_title ~* '(star|replacement)[[:space:]]+note'
        or (p_title ~ '[*★]' and p_title !~* 'lot of|group| set |examples|consecutive|pack of|\(\d+\)| & ')),
      false),
    nullif(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
    p_auction_event_id, p_auction_event_name, p_series_year, p_series_letter, p_state_code,
    nullif(p_thumbnail_url,''), 'trusted', p_raw, now(), now()
  )
  on conflict (source, source_lot_id) do update set
    lot_url=excluded.lot_url, title=excluded.title, sold_on=excluded.sold_on,
    price_realized=excluded.price_realized, series_type=excluded.series_type,
    type_class=excluded.type_class, denomination=excluded.denomination,
    friedberg_number=excluded.friedberg_number, is_star_note=excluded.is_star_note,
    grading_company=excluded.grading_company, grade_raw=excluded.grade_raw,
    grade_numeric=excluded.grade_numeric,
    auction_event_id=coalesce(excluded.auction_event_id, lots_currency.auction_event_id),
    auction_event_name=coalesce(excluded.auction_event_name, lots_currency.auction_event_name),
    thumbnail_url=coalesce(excluded.thumbnail_url, lots_currency.thumbnail_url),
    series_year=excluded.series_year, series_letter=excluded.series_letter, state_code=excluded.state_code,
    raw=excluded.raw, updated_at=now()
  returning (xmax = 0) into v_inserted;

  return (case when v_inserted then 'ins:' else 'upd:' end) || p_source_lot_id;
end $$;
