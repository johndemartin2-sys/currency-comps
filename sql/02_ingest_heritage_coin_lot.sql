-- 02_ingest_heritage_coin_lot.sql (v2.2)
-- v2.2: adds p_ha_category, the numeric Heritage coin_category the sweep was run
-- against, stored verbatim on the row. Reconciliation needs the category that was
-- actually swept: lots_coins.category holds Heritage's series name, which is not
-- one-to-one with a category id (Small Cents 3862 and Large Cents 2755 are both '1C',
-- and a single sweep returns several series names), so the id cannot be inferred back.
-- Heritage coin ingest RPC. Mirrors ingest_heritage_lot (currency) with coin rules:
-- price_kind 'realized'; grade descriptor REQUIRED, grade_numeric OPTIONAL; no raw.v gate;
-- denomination = face value; when blank, derived from category (Colonials left NULL); upsert on (source, source_lot_id).
-- v2.0: designation retired, split into color / strike_designation / surface_designation.
-- v2.1: strike_type added (PROOF / BUSINESS / SPECIMEN). Strike TYPE is the method of manufacture and is
--       NOT a strike DESIGNATION (FS/FB/FBL/FH/FT/5FS). PR/PF/SP arriving in the strike_designation slot
--       (harvester <= v1.4.3) are re-routed instead of rejected. When not supplied, strike_type is derived
--       from grade_raw first, then category. Heritage facet short codes (CA/DC/DM/ND) are normalized.
-- Legacy p_designation is still accepted and routed so pre-v1.3 callers keep working.

-- v2.1 migration (idempotent).
ALTER TABLE public.lots_coins ADD COLUMN IF NOT EXISTS strike_type text;
ALTER TABLE public.lots_coins DROP CONSTRAINT IF EXISTS lots_coins_strike_type_chk;
ALTER TABLE public.lots_coins ADD CONSTRAINT lots_coins_strike_type_chk
  CHECK (strike_type IS NULL OR strike_type IN ('PROOF','BUSINESS','SPECIMEN'));
CREATE INDEX IF NOT EXISTS lots_coins_strike_type_idx ON public.lots_coins (strike_type);

-- Drop the v2.0 (25-arg) signature so PostgREST never sees two candidate overloads.
DROP FUNCTION IF EXISTS public.ingest_heritage_coin_lot(
text,text,text,date,numeric,text,text,text,text,text,integer,boolean,boolean,
text,text,text,text,text,text,jsonb,integer,text,text,text,text);

-- Same reason, one version on: drop the v2.1 (26-arg) signature before creating the
-- 27-arg v2.2, so PostgREST never sees two candidate overloads.
DROP FUNCTION IF EXISTS public.ingest_heritage_coin_lot(
text,text,text,date,numeric,text,text,text,text,text,integer,boolean,boolean,
text,text,text,text,text,text,jsonb,integer,text,text,text,text,text);

ALTER TABLE public.lots_coins ADD COLUMN IF NOT EXISTS ha_category text;
CREATE INDEX IF NOT EXISTS lots_coins_ha_category_year_idx
  ON public.lots_coins (ha_category, series_year);

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
p_series_year integer DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
p_color text DEFAULT NULL,
p_strike_designation text DEFAULT NULL,
p_surface_designation text DEFAULT NULL,
p_strike_type text DEFAULT NULL,
p_ha_category text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
v_now timestamptz := now();
v_denom text := NULLIF(p_denomination,'');
v_color text := NULLIF(upper(btrim(p_color)),'');
v_strike text := NULLIF(upper(btrim(p_strike_designation)),'');
v_surface text := NULLIF(upper(btrim(p_surface_designation)),'');
v_legacy text := NULLIF(upper(btrim(p_designation)),'');
v_variety text := NULLIF(btrim(p_variety),'');
v_stype text := NULLIF(upper(btrim(p_strike_type)),'');
BEGIN
IF p_source_lot_id IS NULL OR p_source_lot_id = '' THEN RAISE EXCEPTION 'reject: source_lot_id missing'; END IF;
IF p_sold_on IS NULL THEN RAISE EXCEPTION 'reject: sold_on missing'; END IF;
IF p_price_realized IS NULL THEN RAISE EXCEPTION 'reject: price_realized missing'; END IF;
IF p_category IS NULL OR p_category = '' THEN RAISE EXCEPTION 'reject: category missing'; END IF;
IF p_grade_raw IS NULL OR p_grade_raw = '' THEN RAISE EXCEPTION 'reject: grade descriptor missing'; END IF;
IF p_grade_numeric IS NOT NULL AND (p_grade_numeric < 1 OR p_grade_numeric > 70) THEN RAISE EXCEPTION 'reject: grade_numeric out of range'; END IF;

-- Normalize incoming strike_type synonyms.
IF v_stype IN ('PR','PF','PROOF') THEN v_stype := 'PROOF';
ELSIF v_stype IN ('SP','SMS','SPECIMEN') THEN v_stype := 'SPECIMEN';
ELSIF v_stype IN ('MS','BIZ','BUSINESS','CIRCULATION') THEN v_stype := 'BUSINESS';
END IF;

-- Rescue strike TYPE values that arrive in the strike DESIGNATION slot (pre-v1.4.4 harvesters).
IF v_strike IN ('PR','PF','PROOF') THEN
v_stype := COALESCE(v_stype,'PROOF'); v_strike := NULL;
ELSIF v_strike IN ('SP','SPECIMEN') THEN
v_stype := COALESCE(v_stype,'SPECIMEN'); v_strike := NULL;
END IF;

-- Heritage designation short codes -> canonical vocabulary. 'ND' means no designation.
IF v_surface IN ('CA','CAMEO') THEN v_surface := 'CAM';
ELSIF v_surface IN ('DC','DCA','DCAMEO') THEN v_surface := 'DCAM';
ELSIF v_surface IN ('DM','DMPL') THEN v_surface := 'DPL';
END IF;
IF v_surface = 'ND' THEN v_surface := NULL; END IF;
IF v_color = 'ND' THEN v_color := NULL; END IF;
IF v_strike = 'ND' THEN v_strike := NULL; END IF;

-- Route a legacy designation into the correct modern column.
IF v_legacy IS NOT NULL THEN
IF v_legacy IN ('PR','PF','PROOF') THEN
v_stype := COALESCE(v_stype,'PROOF');
ELSIF v_legacy IN ('RD','RB','BN') AND v_color IS NULL THEN
v_color := v_legacy;
ELSIF v_legacy IN ('PL','DPL','DMPL','DM','CAM','CA','DCAM','DC','SP') AND v_surface IS NULL THEN
v_surface := CASE v_legacy
WHEN 'DMPL' THEN 'DPL' WHEN 'DM' THEN 'DPL'
WHEN 'CA' THEN 'CAM' WHEN 'DC' THEN 'DCAM'
ELSE v_legacy END;
ELSIF v_legacy IN ('FB','FBL','FH','FT','5FS') AND v_strike IS NULL THEN
v_strike := v_legacy;
ELSIF v_legacy = 'FS' AND v_variety IS NULL THEN
-- 'FS' on a cent is a Fivaz-Stanton variety number, never Full Steps.
v_variety := NULLIF('FS-' || COALESCE(substring(p_title from '(?i)FS[-#]?[[:space:]]?([0-9]{3,4}[A-Za-z]?)'), ''), 'FS-');
END IF;
END IF;

-- Derive strike_type when the harvester did not supply one: certified grade wins, category is fallback.
IF v_stype IS NULL THEN
v_stype := CASE
WHEN p_grade_raw ~* '^[[:space:]]*(PR|PF)' THEN 'PROOF'
WHEN p_grade_raw ~* '^[[:space:]]*SP' THEN 'SPECIMEN'
WHEN p_category ILIKE 'Proof%' THEN 'PROOF'
WHEN p_category ILIKE '%Sms%' THEN 'SPECIMEN'
ELSE 'BUSINESS'
END;
END IF;

-- Controlled vocabulary: reject junk rather than storing it.
IF v_stype NOT IN ('PROOF','BUSINESS','SPECIMEN') THEN RAISE EXCEPTION 'reject: strike_type %', v_stype; END IF;
IF v_color IS NOT NULL AND v_color NOT IN ('RD','RB','BN') THEN RAISE EXCEPTION 'reject: color % not in (RD,RB,BN)', v_color; END IF;
IF v_surface IS NOT NULL AND v_surface NOT IN ('PL','DPL','CAM','DCAM','SP') THEN RAISE EXCEPTION 'reject: surface_designation %', v_surface; END IF;
IF v_strike IS NOT NULL AND v_strike NOT IN ('FS','FB','FBL','FH','FT','5FS') THEN RAISE EXCEPTION 'reject: strike_designation %', v_strike; END IF;

-- Derive denomination from category when the harvester did not supply one.
-- Colonials are intentionally left NULL (mixed denominations; parsed from title by the harvester).
IF v_denom IS NULL THEN
v_denom := CASE
WHEN p_category IN ('Half Cents','Proof Half Cents','Proof Braided Hair Half Cents','Proof Classic Head Half Cents') THEN '1/2C'
WHEN p_category IN ('Large Cents','Proof Large Cents','Flying Eagle Cents','Proof Flying Eagle Cents','Indian Cents','Proof Indian Cents','Lincoln Cents','Proof Lincoln Cents','Sms Lincoln Cents') THEN '1C'
WHEN p_category IN ('Two Cent Pieces','Proof Two Cent Pieces') THEN '2C'
WHEN p_category IN ('Three Cent Nickels','Proof Three Cent Nickels') THEN '3CN'
WHEN p_category IN ('Three Cent Silver','Proof Three Cent Silver') THEN '3CS'
ELSE NULL
END;
END IF;

INSERT INTO public.lots_coins (
source, source_lot_id, lot_url, title, sold_on, price_realized, price_kind,
category, denomination, denomination_raw, grading_company, grade_raw, grade_numeric,
has_cac, has_plus, pcgs_number,
color, strike_designation, surface_designation, strike_type,
variety, die_state, rarity,
auction_event_id, series_year, thumbnail_url, raw, scraped_at, updated_at, ha_category
) VALUES (
'heritage_auctions', p_source_lot_id, p_lot_url, p_title, p_sold_on, p_price_realized, 'realized',
p_category, v_denom, NULLIF(p_denomination_raw,''),
NULLIF(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
COALESCE(p_has_cac,false), COALESCE(p_has_plus,false),
NULLIF(p_pcgs_number,''),
v_color, v_strike, v_surface, v_stype,
v_variety, NULLIF(p_die_state,''), NULLIF(p_rarity,''),
p_auction_event_id, p_series_year, NULLIF(p_thumbnail_url,''), p_raw, v_now, v_now, NULLIF(p_ha_category,'')
)
ON CONFLICT (source, source_lot_id) DO UPDATE SET
lot_url=EXCLUDED.lot_url, title=EXCLUDED.title, sold_on=EXCLUDED.sold_on,
price_realized=EXCLUDED.price_realized, price_kind=EXCLUDED.price_kind,
category=EXCLUDED.category,
ha_category=COALESCE(EXCLUDED.ha_category, lots_coins.ha_category),
denomination=COALESCE(EXCLUDED.denomination, lots_coins.denomination),
denomination_raw=EXCLUDED.denomination_raw,
grading_company=EXCLUDED.grading_company, grade_raw=EXCLUDED.grade_raw, grade_numeric=EXCLUDED.grade_numeric,
has_cac=EXCLUDED.has_cac, has_plus=EXCLUDED.has_plus,
pcgs_number=COALESCE(EXCLUDED.pcgs_number, lots_coins.pcgs_number),
color=COALESCE(EXCLUDED.color, lots_coins.color),
strike_designation=COALESCE(EXCLUDED.strike_designation, lots_coins.strike_designation),
surface_designation=COALESCE(EXCLUDED.surface_designation, lots_coins.surface_designation),
strike_type=COALESCE(EXCLUDED.strike_type, lots_coins.strike_type),
variety=COALESCE(EXCLUDED.variety, lots_coins.variety),
die_state=COALESCE(EXCLUDED.die_state, lots_coins.die_state),
rarity=COALESCE(EXCLUDED.rarity, lots_coins.rarity),
auction_event_id=EXCLUDED.auction_event_id, series_year=EXCLUDED.series_year,
thumbnail_url=COALESCE(EXCLUDED.thumbnail_url, lots_coins.thumbnail_url),
raw=EXCLUDED.raw, updated_at=EXCLUDED.updated_at;

RETURN 'ok:' || p_source_lot_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ingest_heritage_coin_lot(
text,text,text,date,numeric,text,text,text,text,text,integer,boolean,boolean,
text,text,text,text,text,text,jsonb,integer,text,text,text,text,text,text
) TO anon, authenticated;

-- One-time backfill for rows ingested before v2.1 (already applied in prod 2026-07-29):
-- UPDATE public.lots_coins SET strike_type = CASE
--   WHEN grade_raw ~* '^[[:space:]]*(PR|PF)' THEN 'PROOF'
--   WHEN grade_raw ~* '^[[:space:]]*SP' THEN 'SPECIMEN'
--   WHEN category ILIKE 'Proof%' THEN 'PROOF'
--   WHEN category ILIKE '%Sms%' THEN 'SPECIMEN'
--   ELSE 'BUSINESS' END
-- WHERE strike_type IS NULL;
