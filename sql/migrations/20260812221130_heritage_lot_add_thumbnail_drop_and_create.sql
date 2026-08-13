-- Signature change => DROP AND CREATE (never CREATE OR REPLACE), per standing rule.
-- Old-shape 18-param calls (v9.3.1 in the field) resolve to this one via the DEFAULT.
insert into rollback.artifacts (name, kind, content)
select 'fn_ingest_heritage_lot_pre_thumb2_20260812', 'ddl', pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='ingest_heritage_lot'
on conflict (name) do update set content = excluded.content;

drop function public.ingest_heritage_lot(text,text,text,text,date,numeric,text,boolean,text,text,integer,text,jsonb,integer,text,text,text,text);

CREATE FUNCTION public.ingest_heritage_lot(p_source_lot_id text, p_lot_url text, p_title text, p_series_type text, p_sold_on date, p_price_realized numeric, p_denomination text, p_is_star_note boolean, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_auction_event_id text, p_raw jsonb, p_series_year integer DEFAULT NULL::integer, p_series_letter text DEFAULT NULL::text, p_state_code text DEFAULT NULL::text, p_friedberg_number text DEFAULT NULL::text, p_charter_number text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_inserted boolean;
BEGIN
  IF p_source_lot_id IS NULL OR p_source_lot_id = '' THEN RAISE EXCEPTION 'reject: source_lot_id missing'; END IF;
  IF p_sold_on IS NULL THEN RAISE EXCEPTION 'reject: sold_on missing'; END IF;
  IF p_series_type IS NULL OR p_series_type = '' THEN RAISE EXCEPTION 'reject: series_type missing'; END IF;
  IF p_price_realized IS NULL THEN RAISE EXCEPTION 'reject: price_realized missing'; END IF;
  IF p_denomination IS NULL OR p_denomination = '' THEN RAISE EXCEPTION 'reject: denomination unparseable'; END IF;
  IF (p_raw->>'v') IS DISTINCT FROM 'v8' THEN RAISE EXCEPTION 'reject: raw.v must be v8'; END IF;
  IF p_grade_numeric IS NOT NULL AND (p_grade_numeric < 1 OR p_grade_numeric > 70) THEN RAISE EXCEPTION 'reject: grade_numeric out of range'; END IF;

  INSERT INTO public.lots_currency (
    source, source_lot_id, lot_url, title, series_type, sold_on, price_realized,
    price_kind, denomination, is_star_note, grading_company, grade_raw, grade_numeric,
    auction_event_id, series_year, series_letter, state_code,
    friedberg_number, charter_number, thumbnail_url,
    raw, scraped_at, updated_at
  ) VALUES (
    'heritage_auctions', p_source_lot_id, p_lot_url, p_title, p_series_type, p_sold_on, p_price_realized,
    'realized', p_denomination, COALESCE((COALESCE(p_is_star_note, false) OR COALESCE(p_friedberg_number,'') ~ '[*★]' OR p_title ~* '(star|replacement)[[:space:]]+note' OR (p_title ~ '[*★]' AND p_title !~* 'lot of|group| set |examples|consecutive|pack of|\(\d+\)| & ')), false),
    NULLIF(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
    p_auction_event_id, p_series_year, p_series_letter, NULLIF(p_state_code,''),
    NULLIF(p_friedberg_number,''), NULLIF(p_charter_number,''), NULLIF(p_thumbnail_url,''),
    p_raw, v_now, v_now
  )
  ON CONFLICT (source, source_lot_id) DO UPDATE SET
    lot_url = EXCLUDED.lot_url,
    title = EXCLUDED.title,
    series_type = EXCLUDED.series_type,
    sold_on = EXCLUDED.sold_on,
    price_realized = EXCLUDED.price_realized,
    price_kind = EXCLUDED.price_kind,
    denomination = EXCLUDED.denomination,
    is_star_note = EXCLUDED.is_star_note,
    grading_company = EXCLUDED.grading_company,
    grade_raw = EXCLUDED.grade_raw,
    grade_numeric = EXCLUDED.grade_numeric,
    auction_event_id = EXCLUDED.auction_event_id,
    series_year = EXCLUDED.series_year,
    series_letter = EXCLUDED.series_letter,
    state_code = EXCLUDED.state_code,
    friedberg_number = COALESCE(EXCLUDED.friedberg_number, lots_currency.friedberg_number),
    charter_number   = COALESCE(EXCLUDED.charter_number,   lots_currency.charter_number),
    thumbnail_url    = COALESCE(EXCLUDED.thumbnail_url,    lots_currency.thumbnail_url),
    raw = EXCLUDED.raw,
    updated_at = EXCLUDED.updated_at,
    data_quality = 'rescraped'
  RETURNING (xmax = 0) INTO v_inserted;
  RETURN (CASE WHEN v_inserted THEN 'ins:' ELSE 'upd:' END) || p_source_lot_id;
END;
$function$;
