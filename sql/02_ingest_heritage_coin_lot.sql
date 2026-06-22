-- Heritage coin ingest RPC. Mirrors ingest_heritage_lot (currency) with coin rules:
-- price_kind 'realized'; grade descriptor REQUIRED, grade_numeric OPTIONAL; no raw.v gate;
-- denomination = face value; when blank, derived from category (Colonials left NULL); upsert on (source, source_lot_id).
CREATE OR REPLACE FUNCTION public.ingest_heritage_coin_lot(
  p_source_lot_id text, p_lot_url text, p_title text,
  p_sold_on date, p_price_realized numeric,
  p_category text,
  p_denomination text, p_denomination_raw text,
  p_grading_company text, p_grade_raw text, p_grade_numeric integer,
  p_has_cac boolean, p_has_plus boolean,
  p_pcgs_number text, p_designation text,
  p_variety text, p_die_state text, p_rarity text,
  p_auction_event_id text, p_raw jsonb,
  p_series_year integer DEFAULT NULL, p_thumbnail_url text DEFAULT NULL
  ) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_denom text := NULLIF(p_denomination,'');
BEGIN
IF p_source_lot_id IS NULL OR p_source_lot_id = '' THEN RAISE EXCEPTION 'reject: source_lot_id missing'; END IF;
IF p_sold_on IS NULL THEN RAISE EXCEPTION 'reject: sold_on missing'; END IF;
IF p_price_realized IS NULL THEN RAISE EXCEPTION 'reject: price_realized missing'; END IF;
IF p_category IS NULL OR p_category = '' THEN RAISE EXCEPTION 'reject: category missing'; END IF;
IF p_grade_raw IS NULL OR p_grade_raw = '' THEN RAISE EXCEPTION 'reject: grade descriptor missing'; END IF;
IF p_grade_numeric IS NOT NULL AND (p_grade_numeric < 1 OR p_grade_numeric > 70) THEN RAISE EXCEPTION 'reject: grade_numeric out of range'; END IF;

-- Derive denomination from category when the harvester did not supply one.
-- Colonials are intentionally left NULL (mixed denominations; parsed from title by the harvester).
IF v_denom IS NULL THEN
  v_denom := CASE
    WHEN p_category IN ('Half Cents','Proof Half Cents','Proof Braided Hair Half Cents','Proof Classic Head Half Cents') THEN '1/2C'
    WHEN p_category IN ('Large Cents','Proof Large Cents','Flying Eagle Cents','Proof Flying Eagle Cents','Indian Cents','Proof Indian Cents','Lincoln Cents','Proof Lincoln Cents','Sms Lincoln Cents') THEN '1C'
    WHEN p_category IN ('Two Cent Pieces','Proof Two Cent Pieces') THEN '2C'
    ELSE NULL
  END;
END IF;

INSERT INTO public.lots_coins (
  source, source_lot_id, lot_url, title, sold_on, price_realized, price_kind,
  category, denomination, denomination_raw, grading_company, grade_raw, grade_numeric,
  has_cac, has_plus, pcgs_number, designation, variety, die_state, rarity,
  auction_event_id, series_year, thumbnail_url, raw, scraped_at, updated_at
  ) VALUES (
  'heritage_auctions', p_source_lot_id, p_lot_url, p_title, p_sold_on, p_price_realized, 'realized',
  p_category, v_denom, NULLIF(p_denomination_raw,''),
  NULLIF(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
  COALESCE(p_has_cac,false), COALESCE(p_has_plus,false),
  NULLIF(p_pcgs_number,''), NULLIF(p_designation,''), NULLIF(p_variety,''),
  NULLIF(p_die_state,''), NULLIF(p_rarity,''),
  p_auction_event_id, p_series_year, NULLIF(p_thumbnail_url,''), p_raw, v_now, v_now
  )
ON CONFLICT (source, source_lot_id) DO UPDATE SET
lot_url=EXCLUDED.lot_url, title=EXCLUDED.title, sold_on=EXCLUDED.sold_on,
price_realized=EXCLUDED.price_realized, price_kind=EXCLUDED.price_kind,
category=EXCLUDED.category,
denomination=COALESCE(EXCLUDED.denomination, lots_coins.denomination),
denomination_raw=EXCLUDED.denomination_raw,
grading_company=EXCLUDED.grading_company, grade_raw=EXCLUDED.grade_raw, grade_numeric=EXCLUDED.grade_numeric,
has_cac=EXCLUDED.has_cac, has_plus=EXCLUDED.has_plus,
pcgs_number=COALESCE(EXCLUDED.pcgs_number, lots_coins.pcgs_number),
designation=COALESCE(EXCLUDED.designation, lots_coins.designation),
variety=COALESCE(EXCLUDED.variety, lots_coins.variety),
die_state=COALESCE(EXCLUDED.die_state, lots_coins.die_state),
rarity=COALESCE(EXCLUDED.rarity, lots_coins.rarity),
auction_event_id=EXCLUDED.auction_event_id, series_year=EXCLUDED.series_year,
thumbnail_url=COALESCE(EXCLUDED.thumbnail_url, lots_coins.thumbnail_url),
raw=EXCLUDED.raw, updated_at=EXCLUDED.updated_at;
RETURN 'ok:' || p_source_lot_id;
END;
$function$;
